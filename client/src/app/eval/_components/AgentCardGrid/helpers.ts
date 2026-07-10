import type { EvalDashboard } from "@devdigest/shared";

export type EvalAgentCard = EvalDashboard["agents"][number];

/** "Last run vN · <date> · P/T pass" (AC-15), or a never-run fallback — never
    invent a run that doesn't exist. */
export function formatLastRun(agent: EvalAgentCard): string {
  if (agent.last_run_version == null || agent.last_run_at == null) return "No runs yet";
  const date = new Date(agent.last_run_at).toLocaleDateString();
  const pass =
    agent.traces_passed != null && agent.traces_total != null
      ? `${agent.traces_passed}/${agent.traces_total} pass`
      : "— pass";
  return `Last run v${agent.last_run_version} · ${date} · ${pass}`;
}
