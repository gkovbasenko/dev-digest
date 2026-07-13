import type { Container } from '../../platform/container.js';
import type {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiResultArtifact,
  CiRun,
  CiRunStatus,
  RepoRef,
  WorkflowRun,
} from '@devdigest/shared';
import { CiResultArtifact as CiResultArtifactSchema } from '@devdigest/shared';
import { AppError, ValidationError, ExternalServiceError } from '../../platform/errors.js';
import { UNTRUSTED_SKILL_START, UNTRUSTED_SKILL_END } from '../skills/constants.js';
import { agentSlug, agentYaml, slugify, withIdSuffix } from './manifest.js';
import { workflowYaml } from './workflow.js';
import { buildBundle, type BundleSkill } from './bundle.js';
import { readRunnerBundle } from './runner-bundle.js';
import { ARTIFACT_NAME, CI_BRANCH, WORKFLOW_FILENAME } from './constants.js';
import { CiRepository, type CiInstallationRow, type CiRunRow } from './repository.js';

/** Minimal pino-compatible logger (matches `req.log`, mirrors the eval module's own type). */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/**
 * Strip the skills module's "needs vetting" HTML-comment markers before a
 * skill body enters the exported bundle — the exact same boundary
 * `reviews/run-executor.ts` applies before a skill reaches the review prompt
 * (server INSIGHTS 2026-07-01 / 2026-07-07). Re-implemented locally (rather
 * than importing `reviews/helpers.ts`) to keep this module's cross-module
 * surface to the DI container only, mirroring the eval module's
 * `rawDiffFromPrFiles` precedent (`eval/helpers.ts`).
 */
export function stripUntrustedMarkers(body: string): string {
  let s = body.trim();
  if (s.startsWith(UNTRUSTED_SKILL_START)) s = s.slice(UNTRUSTED_SKILL_START.length);
  if (s.endsWith(UNTRUSTED_SKILL_END)) s = s.slice(0, s.length - UNTRUSTED_SKILL_END.length);
  return s.trim();
}

/** Parse `"owner/name"` into a `RepoRef` (no such helper exists yet). */
export function parseOwnerRepo(repo: string): RepoRef {
  const parts = repo.split('/');
  const owner = parts[0];
  const name = parts[1];
  if (parts.length !== 2 || !owner || !name) {
    throw new ValidationError(`Invalid repo "${repo}" — expected "owner/name"`);
  }
  return { owner, name };
}

/**
 * Map a GitHub write failure (commit/PR) on the `open_pr` path to a clean,
 * actionable AppError instead of a raw 500 that leaks the octokit error. The
 * common case is a token without `contents:write` (a 403 "Resource not
 * accessible by personal access token") — the wizard always offers the
 * "Copy files as a zip" fallback, so we point the user there. Already-mapped
 * AppErrors (e.g. a bad repo string) pass through unchanged.
 */
export function githubWriteError(err: unknown, repo: string): AppError {
  if (err instanceof AppError) return err;
  const status =
    (err as { status?: number })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 403 || /resource not accessible|not accessible by/i.test(message)) {
    return new ValidationError(
      `GitHub rejected the commit to "${repo}": the configured token lacks "Contents: write" / "Pull requests: write" on this repository. Grant those permissions to the token, or choose "Copy files as a zip" to add the files manually.`,
    );
  }
  if (status === 404) {
    return new ValidationError(
      `GitHub could not find "${repo}" (404) — check the repo name, or that the configured token can access it.`,
    );
  }
  if (status === 401) {
    return new ValidationError(
      `GitHub rejected the token (401) — the configured GitHub token is invalid or expired.`,
    );
  }
  return new ExternalServiceError(`GitHub request failed while exporting to "${repo}".`, err);
}

/**
 * Deterministic status map for one ingested workflow run (AC-22/AC-23):
 * still-executing runs are "running"; a completed run with no valid artifact
 * "failed"; a validated artifact with zero findings is "no_findings"
 * regardless of the workflow's own conclusion; otherwise the workflow's
 * conclusion decides succeeded vs failed (a `failure` conclusion means the
 * runner's deterministic gate exited non-zero and blocked the PR).
 */
export function mapRunStatus(run: WorkflowRun, artifact: CiResultArtifact | null): CiRunStatus {
  if (run.status !== 'completed') return 'running';
  if (!artifact) return 'failed';
  if (artifact.findings_count === 0) return 'no_findings';
  return run.conclusion === 'failure' ? 'failed' : 'succeeded';
}

function toCiInstallationDto(row: CiInstallationRow): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType as CiInstallation['target_type'],
    installed_at: row.installedAt.toISOString(),
  };
}

function toCiRunDto(row: CiRunRow, agentName: string | null): CiRun {
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    pr_number: row.prNumber,
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    status: row.status,
    findings_count: row.findingsCount,
    cost_usd: row.costUsd,
    github_url: row.githubUrl,
    source: row.source,
    agent: agentName,
    // No `duration_ms`/`duration_s` column exists on `ci_runs` (T1 kept the
    // migration purely additive — only `github_run_id`); always null for v1.
    duration_s: null,
  };
}

/**
 * CI export + pull-ingest service. `export()` serializes an agent into a
 * validated manifest bundle, commits it as ONE reviewable PR to
 * `devdigest/ci` (or returns the files, zero GitHub writes), and
 * persists/upserts the installation. `ingest()` pull-ingests
 * `devdigest-review` workflow runs into `ci_runs` with safeParse-gating,
 * dedupe on the GitHub run id, and deterministic status mapping. Adapters are
 * reached ONLY through `container.github()`/`container.db` (AC-33).
 */
export class CiService {
  private repo: CiRepository;

  constructor(private container: Container) {
    this.repo = new CiRepository(container.db);
  }

  // ---- export -------------------------------------------------------------

  async export(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
    logger?: Logger,
  ): Promise<CiExport | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;

    const skills = await this.loadBundleSkills(agentId);
    const manifestSlug = agentSlug(agent);
    const manifestYaml = agentYaml(
      {
        id: agent.id,
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        strategy: agent.strategy,
        ciFailOn: agent.ciFailOn,
      },
      skills.map((s) => s.slug),
    );
    const workflow = workflowYaml({ triggers: input.triggers, postAs: input.post_as });
    const runnerBundle = readRunnerBundle();
    const files = buildBundle({
      manifestSlug,
      manifestYaml,
      skills,
      runnerBundle,
      workflowYaml: workflow,
    });

    let prUrl: string | null = null;
    if (input.action === 'open_pr') {
      const gh = await this.container.github();
      const repoRef = parseOwnerRepo(input.repo);
      try {
        // ONE atomic commit to devdigest/ci — never the base branch.
        await gh.commitFiles(repoRef, {
          branch: CI_BRANCH,
          base: input.base,
          message: `devdigest: export CI review for "${agent.name}"`,
          files: files.map((f) => ({ path: f.path, contents: f.contents })),
        });
        const existing = await gh.findOpenPr(repoRef, CI_BRANCH);
        if (existing) {
          prUrl = existing.url;
        } else {
          const opened = await gh.openPullRequest(repoRef, {
            title: `DevDigest: add CI review for "${agent.name}"`,
            head: CI_BRANCH,
            base: input.base,
            body: `This PR adds a DevDigest CI review workflow for the "${agent.name}" agent.\n\nGenerated by DevDigest — Export to CI.`,
          });
          prUrl = opened.url;
        }
      } catch (err) {
        // 403 (missing contents:write) / 404 / 401 → a clean, actionable error
        // the wizard can show, plus the zip fallback — never a raw 500.
        throw githubWriteError(err, input.repo);
      }
    }

    const installationRow = await this.repo.upsertInstallation({
      agentId: agent.id,
      repo: input.repo,
      targetType: input.target,
    });

    logger?.info(
      {
        agentId: agent.id,
        agentName: agent.name,
        repo: input.repo,
        target: input.target,
        action: input.action,
        fileCount: files.length,
        prUrl,
      },
      `ci export: agent "${agent.name}" -> ${input.repo} (${input.action})`,
    );

    return {
      installation: toCiInstallationDto(installationRow),
      files,
      pr_url: prUrl,
    };
  }

  /**
   * Enabled-only skills for an agent, with per-bundle-unique slugs and
   * marker-stripped bodies (AC-3). `container.reviewRepo.getEnabledAgentSkills`
   * is the SQL-enforced "only vetted skills leave trusted territory" boundary
   * (server INSIGHTS 2026-07-07); `container.agentsRepo.linkedSkills` supplies
   * the display name needed to derive a readable slug. Only skills present in
   * BOTH (i.e. present in the enabled-filtered query) ever reach the bundle.
   */
  private async loadBundleSkills(agentId: string): Promise<BundleSkill[]> {
    const [linked, enabled] = await Promise.all([
      this.container.agentsRepo.linkedSkills(agentId),
      this.container.reviewRepo.getEnabledAgentSkills(agentId),
    ]);
    const enabledBodyById = new Map(enabled.map((s) => [s.id, s.body]));
    const result: BundleSkill[] = [];
    for (const link of linked) {
      const body = enabledBodyById.get(link.skill.id);
      if (body === undefined) continue; // not enabled — never reaches the bundle
      const slug = withIdSuffix(slugify(link.skill.name), link.skill.id);
      result.push({ slug, body: stripUntrustedMarkers(body) });
    }
    return result;
  }

  // ---- installations (reads) ------------------------------------------------

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listInstallationsForAgent(workspaceId, agentId);
    return rows.map(toCiInstallationDto);
  }

  // ---- ci_runs (reads) --------------------------------------------------------

  async listRunsForAgent(workspaceId: string, agentId: string): Promise<CiRun[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listRunsForAgent(workspaceId, agentId);
    return rows.map((row) => toCiRunDto(row, agent.name));
  }

  async listRunsForWorkspace(workspaceId: string): Promise<CiRun[]> {
    const rows = await this.repo.listRunsForWorkspace(workspaceId);
    return rows.map(({ run, agentName }) => toCiRunDto(run, agentName));
  }

  // ---- ingest -----------------------------------------------------------------

  /**
   * Pull-ingest `devdigest-review` workflow runs into `ci_runs` for every
   * installation in the workspace (AC-20..23). A `listWorkflowRuns` failure
   * for one installation (e.g. repo deleted, token revoked) is logged and
   * skipped — it never aborts the rest of the refresh.
   */
  async ingest(workspaceId: string, logger?: Logger): Promise<{ ingested: number; skipped: number }> {
    const installations = await this.repo.listInstallationsForWorkspace(workspaceId);
    if (installations.length === 0) return { ingested: 0, skipped: 0 };

    const gh = await this.container.github();
    let ingested = 0;
    let skipped = 0;

    for (const installation of installations) {
      const repoRef = parseOwnerRepo(installation.repo);
      let runs: WorkflowRun[];
      try {
        runs = await gh.listWorkflowRuns(repoRef, WORKFLOW_FILENAME);
      } catch (err) {
        logger?.warn(
          { installationId: installation.id, repo: installation.repo, err: (err as Error).message },
          'ci ingest: listWorkflowRuns failed — skipping installation',
        );
        continue;
      }

      for (const run of runs) {
        const outcome = await this.ingestRun(gh, repoRef, installation, run, logger);
        if (outcome === 'inserted') ingested++;
        else skipped++;
      }
    }

    logger?.info(
      { workspaceId, ingested, skipped },
      `ci ingest: ${ingested} run(s) ingested, ${skipped} skipped`,
    );
    return { ingested, skipped };
  }

  private async ingestRun(
    gh: Awaited<ReturnType<Container['github']>>,
    repoRef: RepoRef,
    installation: CiInstallationRow,
    run: WorkflowRun,
    logger?: Logger,
  ): Promise<'inserted' | 'skipped'> {
    const githubRunId = String(run.id);

    // Skip already-terminally-ingested runs (dedupe key). A 'running' row from
    // a prior refresh is re-checked so it can transition once the workflow
    // completes.
    const existing = await this.repo.getRunByGithubId(githubRunId);
    if (existing && existing.status !== 'running') return 'skipped';

    if (run.status !== 'completed') {
      await this.repo.upsertRunByGithubId({
        githubRunId,
        ciInstallationId: installation.id,
        prNumber: run.prNumber,
        ranAt: new Date(),
        status: 'running',
        findingsCount: null,
        costUsd: null,
        githubUrl: run.htmlUrl,
        source: null,
      });
      return 'inserted';
    }

    const raw = await gh.downloadArtifact(repoRef, run.id, ARTIFACT_NAME);
    if (raw == null) {
      // Completed but no result artifact (e.g. a hard runner crash before the
      // artifact upload step) — recorded as a failed run, not silently dropped.
      await this.repo.upsertRunByGithubId({
        githubRunId,
        ciInstallationId: installation.id,
        prNumber: run.prNumber,
        ranAt: new Date(),
        status: 'failed',
        findingsCount: null,
        costUsd: null,
        githubUrl: run.htmlUrl,
        source: null,
      });
      return 'inserted';
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      logger?.warn(
        { githubRunId, repo: installation.repo },
        'ci ingest: result artifact is not valid JSON — skipping',
      );
      return 'skipped';
    }
    const parsed = CiResultArtifactSchema.safeParse(parsedJson);
    if (!parsed.success) {
      logger?.warn(
        { githubRunId, repo: installation.repo, issues: parsed.error.issues },
        'ci ingest: result artifact failed CiResultArtifact validation — skipping',
      );
      return 'skipped';
    }
    const artifact = parsed.data;

    await this.repo.upsertRunByGithubId({
      githubRunId,
      ciInstallationId: installation.id,
      prNumber: artifact.pr_number ?? run.prNumber,
      ranAt: new Date(),
      status: mapRunStatus(run, artifact),
      findingsCount: artifact.findings_count,
      costUsd: artifact.cost_usd,
      githubUrl: run.htmlUrl,
      // No `version` column exists on `ci_runs`; the CI-tab "workflow version"
      // display repurposes the free-text `source` column for the ingested
      // runner version (plan clarification #3 — no schema change beyond
      // `github_run_id`).
      source: artifact.version ?? null,
    });
    return 'inserted';
  }
}
