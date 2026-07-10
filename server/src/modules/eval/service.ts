import type { Container } from '../../platform/container.js';
import type {
  EvalCase,
  EvalDashboard,
  EvalRunRecord,
  EvalRunResult,
  EvalTrendPoint,
  Provider,
  ReviewStrategy,
  UnifiedDiff,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { AgentRow } from '../../db/rows.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { EvalRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import { aggregateRun, scoreCase, type CaseScore } from './scoring.js';
import {
  ExpectedOutput,
  expectedOutputFromFinding,
  parseExpectedOutput,
  rawDiffFromPrFiles,
  sumNullable,
  toEvalCaseDto,
  toEvalRunRecordDto,
} from './helpers.js';
import {
  DASHBOARD_RECENT_RUNS_LIMIT,
  DASHBOARD_SPARKLINE_LIMIT,
  DASHBOARD_TREND_LIMIT,
  MALFORMED_DIFF_REASON,
} from './constants.js';

/** Minimal pino-compatible logger (matches `req.log` / the reviews module's own type). */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

export interface UpdateEvalCaseInput {
  name?: string;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string | null;
}

/**
 * A4 — eval service. Business logic for eval-case CRUD, batch/single run
 * (replays the FROZEN `input_diff` through the exact live review pipeline,
 * NEVER `container.repoIntel`/`loadDiff`/a live PR fetch — AC-7), and the
 * dashboard aggregate.
 */
export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  // ---- eval_cases -----------------------------------------------------

  async listCasesForAgent(workspaceId: string, agentId: string): Promise<EvalCase[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listByOwner(workspaceId, 'agent', agentId);
    return rows.map(toEvalCaseDto);
  }

  /**
   * "Turn into eval case" (AC-1..AC-4). Resolves the finding's owning agent via
   * the SHARED `container.reviewRepo.findingContext` — cross-module data access
   * through the container's sanctioned shared repo, not a direct import of the
   * reviews module's repository class. De-dupes on `source_finding_id`: a
   * re-click returns the already-created case (checked BEFORE any validation,
   * so it still works even if the underlying review/agent later changed).
   */
  async createFromFinding(workspaceId: string, findingId: string): Promise<EvalCase> {
    const existing = await this.repo.findBySourceFinding(workspaceId, findingId);
    if (existing) return toEvalCaseDto(existing);

    const ctx = await this.container.reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const { finding, review, pull } = ctx;

    // AC-4 — a skill-authored (no agent_id) review has no owning agent to eval.
    if (!review.agentId) {
      throw new AppError(
        'finding_has_no_agent',
        "This finding's review has no agent — eval cases are agent-owned only",
        400,
      );
    }

    const action = finding.acceptedAt ? ('accepted' as const) : finding.dismissedAt ? ('dismissed' as const) : null;
    if (!action) {
      throw new ValidationError('Finding must be accepted or dismissed before it can become an eval case');
    }

    // Freeze the diff at creation time — the run later replays THIS text
    // verbatim (parseUnifiedDiff), never a live re-fetch (AC-7).
    const files = await this.container.reviewRepo.getPrFiles(pull.id);
    const rawDiff = rawDiffFromPrFiles(files);
    const expectedOutput = expectedOutputFromFinding(action, finding);

    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: review.agentId,
      name: finding.title,
      inputDiff: rawDiff,
      inputMeta: { pr_number: pull.number, pr_title: pull.title, head_sha: pull.headSha },
      expectedOutput,
      sourceFindingId: findingId,
    });
    return toEvalCaseDto(row);
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: UpdateEvalCaseInput,
  ): Promise<EvalCase | undefined> {
    let expectedOutput: ExpectedOutput | undefined;
    if (patch.expected_output !== undefined) {
      const parsed = ExpectedOutput.safeParse(patch.expected_output);
      if (!parsed.success) {
        throw new ValidationError('Invalid expected_output', parsed.error.flatten());
      }
      expectedOutput = parsed.data;
    }

    const row = await this.repo.updateCase(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, id);
  }

  // ---- run --------------------------------------------------------------

  /** Single-case run (AC-21 — "run on save" in the case editor). */
  async runCase(workspaceId: string, caseId: string, logger?: Logger): Promise<EvalRunResult | undefined> {
    const row = await this.repo.getCase(workspaceId, caseId);
    if (!row) return undefined;
    if (row.ownerKind !== 'agent') {
      throw new AppError('unsupported_owner_kind', 'Only agent-owned eval cases can be run', 400);
    }
    const agent = await this.container.agentsRepo.getById(workspaceId, row.ownerId);
    if (!agent) {
      throw new AppError('owner_agent_missing', "This case's owning agent no longer exists", 400);
    }
    return this.runCases(agent, [row], logger);
  }

  /** Batch run — the agent's whole eval set (AC-8). */
  async runAgentSet(workspaceId: string, agentId: string, logger?: Logger): Promise<EvalRunResult | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const cases = await this.repo.listByOwner(workspaceId, 'agent', agentId);
    return this.runCases(agent, cases, logger);
  }

  /**
   * Execute + score + persist ONE `eval_runs` row for `cases` (AC-8, AC-21).
   * Empty set → 400 (no row persisted).
   */
  private async runCases(agent: AgentRow, cases: EvalCaseRow[], logger?: Logger): Promise<EvalRunResult> {
    if (cases.length === 0) {
      throw new AppError('empty_eval_set', 'No eval cases to run', 400);
    }

    const scores: CaseScore[] = [];
    let keptTotal = 0;
    let droppedTotal = 0;
    for (const c of cases) {
      const { score, kept, dropped } = await this.executeCase(agent, c);
      scores.push(score);
      keptTotal += kept;
      droppedTotal += dropped;
    }

    const aggregate = aggregateRun(scores, { kept: keptTotal, dropped: droppedTotal });
    const durationMs = scores.reduce((sum, s) => sum + s.result.duration_ms, 0);
    const costUsd = sumNullable(scores.map((s) => s.result.cost_usd));
    const caseResults = scores.map((s) => s.result);

    const runRow = await this.repo.insertRun({
      ownerId: agent.id,
      ownerKind: 'agent',
      ownerVersion: agent.version,
      recall: aggregate.recall,
      precision: aggregate.precision,
      citationAccuracy: aggregate.citation_accuracy,
      tracesPassed: aggregate.traces_passed,
      tracesTotal: aggregate.traces_total,
      caseResults,
      durationMs,
      costUsd,
    });

    // Structured per-run log line — the required observability (SSE progress
    // is an optional SHOULD, deferred; see the plan's risks section).
    logger?.info(
      {
        runId: runRow.id,
        ownerId: agent.id,
        ownerVersion: agent.version,
        tracesPassed: aggregate.traces_passed,
        tracesTotal: aggregate.traces_total,
        recall: aggregate.recall,
        precision: aggregate.precision,
        citationAccuracy: aggregate.citation_accuracy,
        durationMs,
        costUsd,
      },
      `eval run: agent "${agent.name}" v${agent.version} — ${aggregate.traces_passed}/${aggregate.traces_total} case(s) passed`,
    );

    return {
      run_id: runRow.id,
      result: {
        recall: aggregate.recall,
        precision: aggregate.precision,
        citation_accuracy: aggregate.citation_accuracy,
        traces_passed: aggregate.traces_passed,
        traces_total: aggregate.traces_total,
        duration_ms: durationMs,
        cost_usd: costUsd,
        case_results: caseResults,
      },
    };
  }

  /**
   * Run ONE case: parse the FROZEN `input_diff` (never re-fetch/repo-intel —
   * AC-7), call the shared review engine, score in pure code. A malformed diff
   * (0 files) or a per-case LLM failure fails that case closed WITHOUT aborting
   * the rest of the run (spec edge cases).
   */
  private async executeCase(
    agent: AgentRow,
    row: EvalCaseRow,
  ): Promise<{ score: CaseScore; kept: number; dropped: number }> {
    const start = Date.now();
    const expected = parseExpectedOutput(row.expectedOutput);

    let diff: UnifiedDiff;
    try {
      diff = parseUnifiedDiff(row.inputDiff ?? '');
    } catch {
      diff = { raw: row.inputDiff ?? '', files: [] };
    }

    if (diff.files.length === 0) {
      const score = scoreCase({
        caseId: row.id,
        name: row.name,
        expected,
        actual: [],
        failed: true,
        failureReason: MALFORMED_DIFF_REASON,
        costUsd: null,
        durationMs: Date.now() - start,
      });
      return { score, kept: 0, dropped: 0 };
    }

    try {
      const llm = await this.container.llm(agent.provider as Provider);
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        ...(agent.strategy ? { strategy: agent.strategy as ReviewStrategy } : {}),
        task: `Eval case: ${row.name}`,
      });
      const score = scoreCase({
        caseId: row.id,
        name: row.name,
        expected,
        actual: outcome.review.findings,
        failed: false,
        costUsd: outcome.costUsd,
        durationMs: Date.now() - start,
      });
      return { score, kept: outcome.review.findings.length, dropped: outcome.dropped.length };
    } catch (err) {
      const score = scoreCase({
        caseId: row.id,
        name: row.name,
        expected,
        actual: [],
        failed: true,
        failureReason: (err as Error).message,
        costUsd: null,
        durationMs: Date.now() - start,
      });
      return { score, kept: 0, dropped: 0 };
    }
  }

  // ---- runs listing + dashboard ------------------------------------------

  async listRunsForAgent(workspaceId: string, agentId: string): Promise<EvalRunRecord[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const runs = await this.repo.runsForOwner('agent', agentId);
    return runs.map(toEvalRunRecordDto);
  }

  async getDashboard(workspaceId: string, agentId?: string): Promise<EvalDashboard> {
    if (agentId) return this.getAgentDashboard(workspaceId, agentId);
    return this.getWorkspaceDashboard(workspaceId);
  }

  private async getAgentDashboard(workspaceId: string, agentId: string): Promise<EvalDashboard> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const runs = await this.repo.runsForOwner('agent', agentId); // newest first
    const casesTotal = await this.repo.casesCountForOwner(workspaceId, 'agent', agentId);
    const [latest, previous] = runs;

    const chronological = [...runs].reverse().slice(-DASHBOARD_TREND_LIMIT);
    const trend: EvalTrendPoint[] = chronological.map((r) => ({
      ran_at: r.ranAt.toISOString(),
      recall: r.recall,
      precision: r.precision,
      citation_accuracy: r.citationAccuracy,
      pass_rate: r.tracesTotal > 0 ? r.tracesPassed / r.tracesTotal : 0,
      cost_usd: r.costUsd,
    }));

    return {
      owner_kind: 'agent',
      owner_id: agentId,
      cases_total: casesTotal,
      current: {
        recall: latest?.recall ?? null,
        precision: latest?.precision ?? null,
        citation_accuracy: latest?.citationAccuracy ?? null,
        traces_passed: latest?.tracesPassed ?? 0,
        traces_total: latest?.tracesTotal ?? 0,
        cost_usd: latest?.costUsd ?? null,
      },
      delta: {
        recall: deltaOf(latest?.recall, previous?.recall),
        precision: deltaOf(latest?.precision, previous?.precision),
        citation_accuracy: deltaOf(latest?.citationAccuracy, previous?.citationAccuracy),
      },
      trend,
      recent_runs: runs.slice(0, DASHBOARD_RECENT_RUNS_LIMIT).map(toEvalRunRecordDto),
      agents: [],
      alert: computeAlert(agent.name, latest, previous),
    };
  }

  /**
   * Workspace-wide dashboard: one card per agent + an all-agents recent-runs
   * table (AC-15/AC-22). Agent ids come from `container.agentsRepo.list` — an
   * `eval_runs` row whose owning agent was deleted (`owner_id` has no FK) is
   * therefore never joined in, satisfying "hide orphan sets, don't 500"
   * without any special-case filtering.
   */
  private async getWorkspaceDashboard(workspaceId: string): Promise<EvalDashboard> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const agentIds = agents.map((a) => a.id);
    const allRuns = await this.repo.runsForOwners('agent', agentIds); // newest first, all agents

    const runsByAgent = new Map<string, EvalRunRow[]>();
    for (const run of allRuns) {
      const list = runsByAgent.get(run.ownerId);
      if (list) list.push(run);
      else runsByAgent.set(run.ownerId, [run]);
    }

    const cards: EvalDashboard['agents'] = [];
    let alert: string | null = null;
    for (const agent of agents) {
      const runs = runsByAgent.get(agent.id) ?? [];
      const [latest, previous] = runs;
      const sparklineSource = [...runs].reverse().slice(-DASHBOARD_SPARKLINE_LIMIT);
      cards.push({
        agent_id: agent.id,
        agent_name: agent.name,
        recall: latest?.recall ?? null,
        precision: latest?.precision ?? null,
        citation_accuracy: latest?.citationAccuracy ?? null,
        sparkline: sparklineSource.map((r) => r.precision).filter((v): v is number => v != null),
        last_run_version: latest?.ownerVersion ?? null,
        last_run_at: latest?.ranAt.toISOString() ?? null,
        traces_passed: latest?.tracesPassed ?? null,
        traces_total: latest?.tracesTotal ?? null,
      });
      if (!alert) alert = computeAlert(agent.name, latest, previous);
    }

    return {
      owner_kind: null,
      owner_id: null,
      cases_total: 0,
      current: {
        recall: null,
        precision: null,
        citation_accuracy: null,
        traces_passed: 0,
        traces_total: 0,
        cost_usd: null,
      },
      delta: { recall: null, precision: null, citation_accuracy: null },
      trend: [],
      recent_runs: allRuns.slice(0, DASHBOARD_RECENT_RUNS_LIMIT).map(toEvalRunRecordDto),
      agents: cards,
      alert,
    };
  }
}

function deltaOf(current?: number | null, previous?: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

/** AC-19 — alert when the latest run's precision dropped vs the previous one. */
function computeAlert(agentName: string, latest?: EvalRunRow, previous?: EvalRunRow): string | null {
  if (!latest || !previous) return null;
  if (latest.precision == null || previous.precision == null) return null;
  if (latest.precision >= previous.precision) return null;
  const from = Math.round(previous.precision * 100);
  const to = Math.round(latest.precision * 100);
  return `Precision dropped for "${agentName}" (v${previous.ownerVersion} → v${latest.ownerVersion}): ${from}% → ${to}%`;
}
