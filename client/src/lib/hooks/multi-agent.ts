/* hooks/multi-agent.ts — React Query hooks for the Multi-Agent Review feature
   (Configure run + Results on `/multi-agent`, and the PR-page picker).

   Runtime VALUE imports of shared contracts must go through the contract's
   subpath (`@devdigest/shared/contracts/observability`), never the bare
   `@devdigest/shared` barrel — a value import from the barrel breaks the
   client webpack build (client INSIGHTS 2026-07-08). Type-only imports may
   still use the barrel. */
"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { MultiAgentRunRequest } from "@devdigest/shared/contracts/observability";
import type { MultiAgentRun } from "@devdigest/shared";

// ---------------------------------------------------------------------------
// Trigger a multi-agent run — POST /pulls/:id/multi-agent-run
// ---------------------------------------------------------------------------

/** One spawned agent run, returned immediately (before it completes) so the
    client can subscribe to `/runs/:runId/events` per column (AC-18). */
export interface MultiAgentTriggerRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
}

export interface MultiAgentTriggerResponse {
  multi_agent_run_id: string;
  pr_id: string;
  runs: MultiAgentTriggerRun[];
}

export interface TriggerMultiAgentRunInput {
  prId: string;
  agentIds: string[];
}

/** Fires exactly one fan-out request for a chosen subset of agents (AC-2).
    The request body is validated client-side against the shared contract
    before it leaves the browser — a cheap boundary check, not a substitute
    for the server's own validation (AC-4). */
export function useMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: TriggerMultiAgentRunInput) => {
      const body = MultiAgentRunRequest.parse({ agentIds });
      return api.post<MultiAgentTriggerResponse>(`/pulls/${prId}/multi-agent-run`, body);
    },
    onSuccess: (_data, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-agent", prId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Read the latest multi-agent run for a PR — GET /pulls/:id/multi-agent
// ---------------------------------------------------------------------------

/** Latest `MultiAgentRun` group for a PR (columns + conflicts), or `null` when
    the PR has never had one (AC-13's documented empty/absent response — a 404
    from the server is treated the same as an explicit empty body). Polls
    while any column is still `running` so Columns/Tabs pick up completions
    without a manual refetch. */
export function useMultiAgentResult(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent", prId],
    queryFn: async (): Promise<MultiAgentRun | null> => {
      try {
        const result = await api.get<MultiAgentRun | null>(`/pulls/${prId}/multi-agent`);
        return result ?? null;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data?.columns ?? []).some((c) => c.status === "running") ? 4000 : false,
  });
}

// ---------------------------------------------------------------------------
// Per-agent stats — GET /agents/:id/stats
// ---------------------------------------------------------------------------

/** Minimal stats subset the server actually returns for this endpoint
    (`AgentStatsMinimal` on the server) — deliberately NOT the full shared
    `AgentStats` contract (accept-rate/trend/findings_by_severity live behind
    a different, richer endpoint). `avg_*` are null when the agent has zero
    (done) runs. */
export interface AgentStatsMinimal {
  agent_id: string;
  agent_name: string;
  runs: number;
  avg_cost_usd: number | null;
  avg_latency_ms: number | null;
}

/** Powers the Configure-run checklist row ("~6s · $0.05" / "— · no data",
    AC-7/8) and feeds the pre-run estimate helper (AC-9/10). */
export function useAgentStats(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-stats", agentId],
    queryFn: () => api.get<AgentStatsMinimal>(`/agents/${agentId}/stats`),
    enabled: !!agentId,
  });
}

/** Same endpoint and `queryKey` shape as `useAgentStats`, batched for a
    variable-length list of agent ids via `useQueries` (the Configure-run
    checklist needs one stats query per ENABLED agent, not just the selected
    ones — AC-7/8 — so calling `useAgentStats` in a `.map()` would call a hook
    a variable number of times in one component body). Sharing the exact
    `queryKey`/`queryFn` here keeps the cache entry identical to
    `useAgentStats`'s — no duplicate fetch, no drifted retry/staleTime policy.
    Results are returned in the same order as `agentIds`. */
export function useAgentsStats(agentIds: string[]) {
  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["agent-stats", agentId],
      queryFn: () => api.get<AgentStatsMinimal>(`/agents/${agentId}/stats`),
    })),
  });
}
