import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { FindingRow } from '../../../db/rows.js';

export type MultiAgentRunRow = typeof t.multiAgentRuns.$inferSelect;

/** One agent_runs row (+ its agent name + its persisted 'review' row, if any)
 *  belonging to one multi-agent-run group. `reviewId`/`verdict`/`summary`/
 *  `score` are null until the background run persists its review. */
export interface GroupRunRow {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  reviewId: string | null;
  verdict: string | null;
  summary: string | null;
  score: number | null;
}

// ---- multi_agent_runs (grouping) -------------------------------------------

/**
 * Create a new multi-agent-run group row. Concurrent groups on the same PR are
 * explicitly permitted (AC-15) — this always inserts a fresh row, never
 * mutates a prior one.
 */
export async function createMultiAgentRun(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<MultiAgentRunRow> {
  const [row] = await db.insert(t.multiAgentRuns).values({ workspaceId, prId }).returning();
  return row!;
}

/**
 * The latest group for a PR, ordered by `ran_at` descending, tie-broken by
 * `id` (descending) for determinism when two groups share a timestamp
 * (AC-14 / spec edge case).
 */
export async function getLatestMultiAgentRun(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<MultiAgentRunRow | undefined> {
  const [row] = await db
    .select()
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
    .limit(1);
  return row;
}

// ---- agent_runs (+ agents, + reviews) for one group ------------------------

/**
 * Every `agent_runs` row linked to one group (via `multi_agent_run_id`),
 * joined to the agent's name and — when the background run has persisted one
 * — its `reviews` row (kind='review'). Ordered by `ran_at`/`id` so column
 * order is stable across reads of the same group.
 */
export async function getRunsForGroup(db: Db, multiAgentRunId: string): Promise<GroupRunRow[]> {
  const rows = await db
    .select({
      runId: t.agentRuns.id,
      agentId: t.agentRuns.agentId,
      agentName: t.agents.name,
      provider: t.agentRuns.provider,
      model: t.agentRuns.model,
      status: t.agentRuns.status,
      durationMs: t.agentRuns.durationMs,
      tokensIn: t.agentRuns.tokensIn,
      tokensOut: t.agentRuns.tokensOut,
      reviewId: t.reviews.id,
      verdict: t.reviews.verdict,
      summary: t.reviews.summary,
      score: t.reviews.score,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .leftJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.kind, 'review')))
    .where(eq(t.agentRuns.multiAgentRunId, multiAgentRunId))
    .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
  return rows;
}

/**
 * Findings scoped to the GIVEN review ids only — never a PR-wide or
 * latest-review-only scan (server INSIGHTS 2026-06-30: a PR can have many
 * `reviews` rows; this bounds the read to exactly this group's own reviews).
 */
export async function getFindingsForReviews(db: Db, reviewIds: string[]): Promise<FindingRow[]> {
  if (reviewIds.length === 0) return [];
  return db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds));
}
