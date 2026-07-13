import type { EvalDashboard } from "@devdigest/shared";

/** owner_id -> agent_name lookup built from the dashboard's per-agent card
    list — `EvalRunRecord` carries only `owner_id`, so the ALL-AGENTS
    recent-runs table needs this to label each row. */
export function buildAgentNameMap(agents: EvalDashboard["agents"]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const agent of agents) map[agent.agent_id] = agent.agent_name;
  return map;
}
