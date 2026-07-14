import type { Container } from '../../platform/container.js';
import {
  MultiAgentRun,
  PrHistory,
  RiskBrief as RiskBriefSchema,
  type BriefRead,
  type FindingActionKind,
  type PrBlastResponse,
  type PrIntentRecord,
  type RunEventKind,
  type RunTrace,
  type SmartDiffResponse,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { AgentRow, FindingRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { findingRowToDto, reviewToDto } from './helpers.js';
import { computeIntent, type IntentLogger } from './intent/compute.js';
import { computeBrief } from './brief/compute.js';
import { groundBrief } from './brief/ground.js';
import { composeSmartDiff } from './smart-diff/compose.js';
import { toPrBlastResponse } from './blast/map.js';
import { groupPriorPrRows } from './prior-prs/map.js';
import { assembleMultiAgentRun } from './multi-agent/assemble.js';

/** Cap on "prior PRs touching these files" results — an unbounded overlap
 *  query on a busy repo would be a footgun (server INSIGHTS/plan gotcha). */
const PRIOR_PRS_LIMIT = 10;

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Multi-agent run (grouping): trigger a fan-out group + read the latest one.
  // ===========================================================================

  /**
   * Trigger a fan-out review across `agentIds`: creates ONE `multi_agent_runs`
   * group row and N linked `agent_runs` rows (one per requested agent), then
   * fires the SAME bounded-concurrency executor used by the legacy single/all
   * trigger, fire-and-forget. Returns every agent's `run_id` immediately
   * (AC-18), before any review is persisted.
   *
   * Validation (AC-4): `agentIds` is checked against `listEnabled(workspaceId)`
   * — this single intersection catches "empty", "unknown id", "not in this
   * workspace", and "disabled" all at once. The group + agent_runs rows are
   * created ONLY after every id passes, so an invalid request creates zero
   * rows in `multi_agent_runs`/`agent_runs`/`reviews`.
   */
  async triggerMultiAgentRun(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<{
    multi_agent_run_id: string;
    pr_id: string;
    runs: { run_id: string; agent_id: string; agent_name: string }[];
  }> {
    if (agentIds.length === 0) throw new ValidationError('Provide at least one agentId');
    if (new Set(agentIds).size !== agentIds.length) {
      throw new ValidationError('agentIds must not contain duplicates');
    }

    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const enabled = await this.agents.listEnabled(workspaceId);
    const enabledById = new Map(enabled.map((a) => [a.id, a]));
    const targets: AgentRow[] = [];
    for (const id of agentIds) {
      const agent = enabledById.get(id);
      if (!agent) {
        throw new ValidationError(
          `Agent ${id} is not an enabled agent in this workspace`,
        );
      }
      targets.push(agent);
    }

    const group = await this.repo.createMultiAgentRun(workspaceId, prId);

    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
        multiAgentRunId: group.id,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget, same pattern as `runReview`; one summary log line when
    // the whole group finishes (Observability spec — `multi_agent_run.complete`).
    const startedAt = Date.now();
    void this.executor
      .executeRuns(workspaceId, pull, repo, jobs, logger)
      .then(() => {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            event: 'multi_agent_run.complete',
            multiAgentRunId: group.id,
            prId,
            agentCount: jobs.length,
            durationMs: Date.now() - startedAt,
          }),
        );
      })
      .catch((err) => {
        logger?.error(
          { prId, multiAgentRunId: group.id, err: (err as Error).message },
          'multi-agent: background execution crashed',
        );
      });

    return { multi_agent_run_id: group.id, pr_id: prId, runs };
  }

  /**
   * The latest multi-agent-run group for a PR, shaped as `MultiAgentRun`
   * (columns + conflicts + null-safe cost/duration rollups) — `null` when the
   * PR has never had a multi-agent run (AC-13's "documented empty/absent
   * response", mirroring the existing `getIntent` null-read convention).
   * Findings are scoped to THIS group's own runs, never a PR-wide or
   * latest-review-only read (server INSIGHTS 2026-06-30).
   */
  async getMultiAgentRun(workspaceId: string, prId: string): Promise<MultiAgentRun | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const group = await this.repo.getLatestMultiAgentRun(workspaceId, prId);
    if (!group) return null;

    const runs = await this.repo.getRunsForGroup(group.id);
    const reviewIds = runs
      .map((r) => r.reviewId)
      .filter((id): id is string => id !== null);
    const findings = await this.repo.getFindingsForReviews(reviewIds);

    const findingsByReviewId = new Map<string, FindingRow[]>();
    for (const f of findings) {
      const arr = findingsByReviewId.get(f.reviewId) ?? [];
      arr.push(f);
      findingsByReviewId.set(f.reviewId, arr);
    }

    const assembled = assembleMultiAgentRun(group, pull.number, runs, findingsByReviewId);
    return MultiAgentRun.parse(assembled);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }

  // ===========================================================================
  // Intent (derived PR scope)
  // ===========================================================================

  /** Stored intent for a PR, or null when none has been computed yet. */
  async getIntent(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const intent = await this.repo.getIntent(prId);
    return intent ? { ...intent, pr_id: prId } : null;
  }

  /** Compute (or re-compute) a PR's intent/scope and upsert it (PK on prId). */
  async recomputeIntent(
    workspaceId: string,
    prId: string,
    logger?: IntentLogger,
  ): Promise<PrIntentRecord> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const files = await this.repo.getPrFiles(prId);

    const intent = await computeIntent({
      container: this.container,
      workspaceId,
      pull,
      repo,
      files,
      logger,
    });
    await this.repo.upsertIntent(prId, intent);
    return { ...intent, pr_id: prId };
  }

  // ===========================================================================
  // Brief (Why+Risk; single-call synthesis over already-built artifacts)
  // ===========================================================================

  /** Cached DB read — zero LLM calls (AC-17). No row yet ⇒ `exists:false` (AC-9). */
  async getBrief(workspaceId: string, prId: string): Promise<BriefRead> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const row = await this.repo.getBrief(prId);
    if (!row) return { exists: false, stale: false, generated_at: null, brief: null };

    // Defense-in-depth: row.json is jsonb (unknown at the type level). We are
    // the only writer, but re-validate against the contract rather than
    // trusting it blindly — a corrupt row degrades to a null brief, not a 500.
    const parsed = RiskBriefSchema.safeParse(row.json);
    const stale = row.generationHeadSha !== pull.headSha; // null ⇒ stale (AC-10)

    return {
      exists: true,
      stale,
      generated_at: row.generatedAt ? row.generatedAt.toISOString() : null,
      brief: parsed.success ? parsed.data : null,
    };
  }

  /**
   * Paid generation — exactly one `completeStructured` call (AC-1). Gated
   * BEFORE any LLM call/write when the PR has no changed files (AC-2). A
   * validation/LLM failure throws before the upsert, leaving any prior row
   * untouched (AC-3, AC-18).
   */
  async generateBrief(workspaceId: string, prId: string): Promise<BriefRead> {
    const startedAt = Date.now();
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const files = await this.repo.getPrFiles(prId);

    if (files.length === 0) {
      throw new ValidationError('PR has no changed files — nothing to brief');
    }

    const [intentRecord, blast, smartDiff] = await Promise.all([
      this.getIntent(workspaceId, prId),
      this.getBlast(workspaceId, prId),
      this.getSmartDiff(workspaceId, prId),
    ]);

    const { brief, provider, model, inputPresence } = await computeBrief({
      container: this.container,
      workspaceId,
      repoId: pull.repoId,
      pull,
      repo,
      files,
      intent: intentRecord,
      blast,
      smartDiff,
    });

    // Ground every model-emitted file reference against the real changed
    // files + repo-intel index before persist (AC-7).
    const emittedPaths = [
      ...new Set([...brief.risks.flatMap((r) => r.file_refs), ...brief.review_focus.map((f) => f.file)]),
    ];
    const rankRows =
      emittedPaths.length > 0 ? await this.container.repoIntel.getFileRank(pull.repoId, emittedPaths) : [];
    const validPaths = new Set<string>([...files.map((f) => f.path), ...rankRows.map((r) => r.path)]);
    const { brief: grounded, droppedCount } = groundBrief(brief, validPaths);

    const generatedAt = new Date();
    await this.repo.upsertBrief(prId, { json: grounded, generatedAt, generationHeadSha: pull.headSha });

    // Structured JSON, one line per generation — no secrets, PR-scoped.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: 'brief.generate',
        prId,
        provider,
        model,
        inputPresence,
        fileCount: files.length,
        droppedCount,
        durationMs: Date.now() - startedAt,
      }),
    );

    return { exists: true, stale: false, generated_at: generatedAt.toISOString(), brief: grounded };
  }

  // ===========================================================================
  // Smart Diff (deterministic re-layout; no LLM call, no persistence)
  // ===========================================================================

  /**
   * Compose a PR's Smart Diff: classify each changed file (core/wiring/
   * boilerplate) and overlay finding line numbers, purely from already-fetched
   * files + already-computed findings.
   */
  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const files = await this.repo.getPrFiles(prId);
    const reviews = await this.repo.reviewsForPull(prId);
    // Latest-review-only: `reviewsForPull` returns newest-first, so `[0]` is
    // the most recent run. This can hide open findings from earlier reviews
    // (server/INSIGHTS.md 2026-06-30) — accepted for Smart Diff v1.
    const findings = (reviews[0]?.findings ?? []).map(findingRowToDto);
    return composeSmartDiff(files, findings);
  }

  // ===========================================================================
  // Blast radius (deterministic read over the repo-intel index; no LLM)
  // ===========================================================================

  /**
   * Compose a PR's blast radius: changed symbols, grouped downstream callers,
   * impacted endpoints/crons, and index status/degraded flag. Purely a read
   * over `container.repoIntel` (the facade) — no direct index/DB access, no
   * LLM call. `summary` stays empty here (reserved for the deferred one-
   * paragraph LLM explanation, T4).
   */
  async getBlast(workspaceId: string, prId: string): Promise<PrBlastResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const files = await this.repo.getPrFiles(prId);
    const changedFiles = files.map((f) => f.path);

    const blast = await this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles);
    const state = await this.container.repoIntel.getIndexState(pull.repoId);

    return toPrBlastResponse(blast, state);
  }

  // ===========================================================================
  // Prior PRs touching these files (deterministic read; no LLM)
  // ===========================================================================

  /**
   * Other MERGED PRs in the same repo whose persisted `pr_files` overlap this
   * PR's changed files, most-recent first, capped at `PRIOR_PRS_LIMIT`.
   *
   * `pull_requests.status` stores GitHub's merge state directly (set via
   * `mapStatus` on import — `server/src/adapters/github/octokit.ts:19` — so
   * `status = 'merged'` IS actually written), and there is no separate
   * merge-timestamp column, so `merged_at` is derived from `updated_at`
   * (see `groupPriorPrRows`).
   */
  async getPriorPrs(workspaceId: string, prId: string): Promise<PrHistory> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.repo.getPrFiles(prId);
    const changedFiles = files.map((f) => f.path);
    if (changedFiles.length === 0) return PrHistory.parse({ history: [] });

    const rows = await this.repo.getPriorPrRows(pull.repoId, prId, changedFiles, PRIOR_PRS_LIMIT);
    const history = groupPriorPrRows(rows, PRIOR_PRS_LIMIT);
    return PrHistory.parse({ history });
  }
}
