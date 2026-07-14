/**
 * Assemble a `MultiAgentRun` response (columns + conflicts + rollups) from the
 * group's persisted rows. Pure — no DB access (the repository already did the
 * reads); the only "computation" beyond simple mapping is delegating to the
 * T3 conflict matcher.
 */
import type { AgentColumn, AgentColumnFinding, Finding, MultiAgentRun } from '@devdigest/shared';
import type { FindingRow } from '../../../db/rows.js';
import { estimateCost } from '../../../adapters/llm/pricing.js';
import { findingRowToDto } from '../helpers.js';
import { computeConflicts, type AgentReviewResult } from './conflicts.js';
import type { GroupRunRow } from '../repository/multi-agent.repo.js';

/**
 * `AgentColumn.status` has no `'cancelled'` member (only done|failed|running) —
 * a DB status of `cancelled` (user-cancelled run) collapses to `'failed'` so
 * the response still validates against the contract (spec T6 note / AC-30
 * "errored" header).
 */
function toColumnStatus(status: string | null): AgentColumn['status'] {
  if (status === 'done') return 'done';
  if (status === 'running') return 'running';
  return 'failed'; // 'failed' | 'cancelled' | null
}

function findingRowToColumnFinding(row: FindingRow): AgentColumnFinding {
  return {
    id: row.id,
    severity: row.severity as AgentColumnFinding['severity'],
    category: row.category,
    title: row.title,
    file: row.file,
    start_line: row.startLine,
    kind: row.kind,
  };
}

/** Null-safe per-run cost — `estimateCost` returns null for unpriced/unknown models. */
function runCostUsd(model: string | null, tokensIn: number | null, tokensOut: number | null): number | null {
  if (model == null || tokensIn == null || tokensOut == null) return null;
  return estimateCost(model, tokensIn, tokensOut);
}

export function assembleMultiAgentRun(
  group: { id: string; prId: string; ranAt: Date },
  prNumber: number | null,
  runs: GroupRunRow[],
  findingsByReviewId: Map<string, FindingRow[]>,
): MultiAgentRun {
  const columns: AgentColumn[] = runs.map((r) => {
    const findingRows = r.reviewId ? (findingsByReviewId.get(r.reviewId) ?? []) : [];
    return {
      run_id: r.runId,
      agent_id: r.agentId ?? `deleted-${r.runId}`,
      agent_name: r.agentName ?? 'Unknown agent',
      provider: r.provider,
      model: r.model,
      status: toColumnStatus(r.status),
      verdict: r.verdict,
      score: r.score,
      summary: r.summary,
      duration_ms: r.durationMs,
      cost_usd: runCostUsd(r.model, r.tokensIn, r.tokensOut),
      findings: findingRows.map(findingRowToColumnFinding),
    };
  });

  // total_duration_ms: sum of each agent's own duration (not yet-finished runs
  // contribute 0) — distinct from the pre-run "max latency" wall-clock
  // ESTIMATE the client computes (T7/AC-9); this is the actual completed sum.
  const totalDurationMs = runs.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);

  // total_cost_usd: sum of the columns with a known cost; null only when NONE
  // of them resolved a cost (all unpriced models / all still running/failed) —
  // same null-safe convention as agents/service.ts `getStats` (server INSIGHTS
  // 2026-06-29).
  const knownCosts = columns.map((c) => c.cost_usd).filter((c): c is number => c !== null);
  const totalCostUsd = knownCosts.length > 0 ? knownCosts.reduce((a, b) => a + b, 0) : null;

  const agentResults: AgentReviewResult[] = runs.map((r) => ({
    agentId: r.agentId ?? `deleted-${r.runId}`,
    persona: r.agentName ?? 'Unknown agent',
    status: r.status ?? 'unknown',
    findings: (r.reviewId ? (findingsByReviewId.get(r.reviewId) ?? []) : []).map(
      (row): Finding => findingRowToDto(row),
    ),
  }));

  return {
    id: group.id,
    pr_id: group.prId,
    pr_number: prNumber ?? null,
    ran_at: group.ranAt.toISOString(),
    agent_count: runs.length,
    total_duration_ms: totalDurationMs,
    total_cost_usd: totalCostUsd,
    columns,
    conflicts: computeConflicts(agentResults),
  };
}
