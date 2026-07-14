/* helpers.ts — pure pre-run estimate for the Configure-run checklist (AC-9/10).
   No React, no data fetching — inputs are plain `{ avg_cost_usd, avg_latency_ms }`
   snapshots (as returned by `useAgentStats`) so this stays unit-testable in
   isolation. Rendering (checklist rows, summary line) is T9's job. */

/** The two averages a single agent's stats snapshot carries. Both are `null`
    together when the agent has zero (done) runs (server contract, AC-11). */
export interface AgentAverages {
  avg_cost_usd: number | null;
  avg_latency_ms: number | null;
}

/** One selected agent's stats as known to the picker — `stats` is `null`/
    `undefined` while `useAgentStats`/`useAgentsStats` hasn't resolved yet or
    the agent has no history at all. `isLoading` disambiguates those two:
    true while the query is still in flight (unknown yet), false once it has
    settled (so `stats.avg_latency_ms == null` then means "confirmed no
    history"). Without this flag a still-loading agent is indistinguishable
    from a confirmed-no-history one and gets miscounted as "no history". */
export interface SelectedAgentEstimateInput {
  agentId: string;
  stats: AgentAverages | null | undefined;
  isLoading: boolean;
}

export interface RunEstimate {
  /** sum(avg_cost_usd) over agents that have history; null when none of them
      have cost data (either no history, or an unpriced model everywhere). */
  totalCostUsd: number | null;
  /** max(avg_latency_ms) over agents that have history — the parallel
      fan-out wall-clock (AC-9); null when none have latency data. */
  maxLatencyMs: number | null;
  /** Count of selected agents with no run history (`avg_latency_ms == null`). */
  excludedCount: number;
  /** Formatted summary line, e.g. "≈ 8.2s · $0.11 · parallel fan-out"; empty
      string when there is nothing to estimate (no agent has history). */
  label: string;
  /** Incompleteness marker text (AC-10), or null when every selected agent
      has history. */
  incompleteMarker: string | null;
}

const EMPTY_ESTIMATE: RunEstimate = {
  totalCostUsd: null,
  maxLatencyMs: null,
  excludedCount: 0,
  label: "",
  incompleteMarker: null,
};

/** Rounds to one decimal place and drops a trailing ".0" (`4000` → "4s",
    `8200` → "8.2s"). */
export function formatEstimateSeconds(ms: number): string {
  const seconds = Math.round((ms / 1000) * 10) / 10;
  return `${seconds}s`;
}

export function formatEstimateCostUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Computes the pre-run summary estimate (AC-9) plus an incompleteness marker
    when at least one selected agent has no history (AC-10). An agent "has
    history" iff its stats snapshot resolved and `avg_latency_ms` is not null
    (the signal that it has at least one done run) — its cost may still be
    null-safely excluded from the sum alone if the model is unpriced. An agent
    whose query is still `isLoading` is skipped entirely (neither summed nor
    counted in `excludedCount`) — until the query resolves we don't yet know
    whether it has history, so it must not be reported as "no history". */
export function estimateMultiAgentRun(agents: SelectedAgentEstimateInput[]): RunEstimate {
  if (agents.length === 0) return EMPTY_ESTIMATE;

  let costSum = 0;
  let hasCost = false;
  let maxLatency = 0;
  let hasLatency = false;
  let excludedCount = 0;

  for (const { stats, isLoading } of agents) {
    if (isLoading) continue; // not yet resolved — don't guess either way

    const hasHistory = stats != null && stats.avg_latency_ms != null;
    if (!hasHistory) {
      excludedCount += 1;
      continue;
    }
    if (stats.avg_cost_usd != null) {
      costSum += stats.avg_cost_usd;
      hasCost = true;
    }
    // stats.avg_latency_ms is non-null here (checked by hasHistory above).
    maxLatency = Math.max(maxLatency, stats.avg_latency_ms as number);
    hasLatency = true;
  }

  const totalCostUsd = hasCost ? costSum : null;
  const maxLatencyMs = hasLatency ? maxLatency : null;

  const parts: string[] = [];
  if (maxLatencyMs != null) parts.push(formatEstimateSeconds(maxLatencyMs));
  if (totalCostUsd != null) parts.push(formatEstimateCostUsd(totalCostUsd));
  const label = parts.length > 0 ? `≈ ${[...parts, "parallel fan-out"].join(" · ")}` : "";

  const incompleteMarker =
    excludedCount > 0
      ? `estimate excludes ${excludedCount} agent${excludedCount === 1 ? "" : "s"} with no history`
      : null;

  return { totalCostUsd, maxLatencyMs, excludedCount, label, incompleteMarker };
}

/** Formats one checklist row's stats (AC-7/8) — "~6s · $0.05" when the agent
    has history, "— · no data" when the query has resolved and it genuinely
    has none, and "…" while the query is still `isLoading` (so a
    just-selected PR never flashes "no data" for an agent whose history just
    hasn't loaded yet). An agent with latency history but an unpriced model
    shows "~6s · —" (null-safe cost without hiding the latency it does have). */
export function formatAgentRowStats(stats: AgentAverages | null | undefined, isLoading: boolean): string {
  if (isLoading) return "…";
  if (stats == null || stats.avg_latency_ms == null) return "— · no data";
  const duration = `~${formatEstimateSeconds(stats.avg_latency_ms)}`;
  const cost = stats.avg_cost_usd != null ? formatEstimateCostUsd(stats.avg_cost_usd) : "—";
  return `${duration} · ${cost}`;
}
