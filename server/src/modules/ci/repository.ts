import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiRunStatus, CiTarget } from '@devdigest/shared';

/**
 * CI data-access. Owns `ci_installations` and `ci_runs`, both workspace-scoped
 * via the owning agent's `workspace_id` (neither table carries its own
 * `workspace_id` column — see `db/schema/ci.ts`).
 *
 * `ci_installations` has NO unique index on `(agent_id, repo)` (T1 only added
 * `ci_runs.github_run_id` — server INSIGHTS 2026-07-02: a mixed add/drop
 * schema diff hangs `db:generate`, so the additive column was kept minimal).
 * `upsertInstallation` is therefore an application-level
 * select-then-insert/update rather than a native `ON CONFLICT`. `ci_runs`
 * DOES have a real unique index (`ci_runs_github_run_id_uq`, migration 0022),
 * so that upsert uses `onConflictDoUpdate`.
 */

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;
export type CiRunRow = typeof t.ciRuns.$inferSelect;

export interface UpsertCiInstallation {
  agentId: string;
  repo: string;
  targetType: CiTarget;
}

export interface UpsertCiRun {
  githubRunId: string;
  ciInstallationId: string;
  prNumber: number | null;
  ranAt: Date | null;
  status: CiRunStatus;
  findingsCount: number | null;
  costUsd: number | null;
  githubUrl: string | null;
  source: string | null;
}

export class CiRepository {
  constructor(private db: Db) {}

  // ---- ci_installations ---------------------------------------------------

  async findInstallationByAgentRepo(
    agentId: string,
    repo: string,
  ): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, repo)));
    return row;
  }

  /** One installation per (agent, repo) — see class doc for why this isn't a native upsert. */
  async upsertInstallation(values: UpsertCiInstallation): Promise<CiInstallationRow> {
    const existing = await this.findInstallationByAgentRepo(values.agentId, values.repo);
    if (existing) {
      if (existing.targetType === values.targetType) return existing;
      const [row] = await this.db
        .update(t.ciInstallations)
        .set({ targetType: values.targetType })
        .where(eq(t.ciInstallations.id, existing.id))
        .returning();
      return row!;
    }
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({ agentId: values.agentId, repo: values.repo, targetType: values.targetType })
      .returning();
    return row!;
  }

  /** One agent's installations, workspace-scoped via the agent join. */
  async listInstallationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallationRow[]> {
    const rows = await this.db
      .select({ installation: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)))
      .orderBy(desc(t.ciInstallations.installedAt));
    return rows.map((r) => r.installation);
  }

  /** Every installation across the workspace's agents — `ingest()` iterates these. */
  async listInstallationsForWorkspace(workspaceId: string): Promise<CiInstallationRow[]> {
    const rows = await this.db
      .select({ installation: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId));
    return rows.map((r) => r.installation);
  }

  // ---- ci_runs --------------------------------------------------------------

  async getRunByGithubId(githubRunId: string): Promise<CiRunRow | undefined> {
    const [row] = await this.db.select().from(t.ciRuns).where(eq(t.ciRuns.githubRunId, githubRunId));
    return row;
  }

  /** Upsert on the real `ci_runs_github_run_id_uq` unique index. */
  async upsertRunByGithubId(values: UpsertCiRun): Promise<CiRunRow> {
    const columns = {
      ciInstallationId: values.ciInstallationId,
      prNumber: values.prNumber,
      ranAt: values.ranAt,
      status: values.status,
      findingsCount: values.findingsCount,
      costUsd: values.costUsd,
      githubUrl: values.githubUrl,
      source: values.source,
    };
    const [row] = await this.db
      .insert(t.ciRuns)
      .values({ githubRunId: values.githubRunId, ...columns })
      .onConflictDoUpdate({ target: t.ciRuns.githubRunId, set: columns })
      .returning();
    return row!;
  }

  /** Runs for one agent, newest first, workspace-scoped via installation → agent join. */
  async listRunsForAgent(workspaceId: string, agentId: string): Promise<CiRunRow[]> {
    const rows = await this.db
      .select({ run: t.ciRuns })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
      .orderBy(desc(t.ciRuns.ranAt));
    return rows.map((r) => r.run);
  }

  /**
   * Workspace-wide run list with the owning agent's name (CI Runs page).
   * LEFT JOINed so a run whose installation was later deleted
   * (`ci_installation_id` → null on `ON DELETE SET NULL`) still shows, with
   * `agentName: null` — the spec's "tolerate a null ci_installation_id" edge
   * case (AC-25).
   */
  async listRunsForWorkspace(
    workspaceId: string,
    limit?: number,
  ): Promise<{ run: CiRunRow; agentName: string | null }[]> {
    const q = this.db
      .select({ run: t.ciRuns, agentName: t.agents.name })
      .from(t.ciRuns)
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(or(eq(t.agents.workspaceId, workspaceId), isNull(t.ciRuns.ciInstallationId)))
      .orderBy(desc(t.ciRuns.ranAt));
    return limit ? q.limit(limit) : q;
  }
}
