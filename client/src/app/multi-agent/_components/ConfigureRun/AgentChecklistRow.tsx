/* AgentChecklistRow — one row of the Configure-run agent checklist (step 2,
   AC-1-shaped for /multi-agent, AC-6/7/8). Purely presentational: stats are
   fetched once for every enabled agent by the parent (`useQueries`, so the
   number of queries can vary with the agent list without breaking the rules
   of hooks) and passed down here as props. */
import { Checkbox } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { formatAgentRowStats, type AgentAverages } from "./helpers";
import { s } from "./styles";

export function AgentChecklistRow({
  agent,
  checked,
  disabled,
  stats,
  isLoading,
  onToggle,
}: {
  agent: Agent;
  checked: boolean;
  /** True while no PR is selected (AC-6) — the row stays visible but inert. */
  disabled: boolean;
  stats: AgentAverages | null | undefined;
  /** True while this agent's stats query is still in flight — see the
      `formatAgentRowStats` doc comment for why this must be tracked
      separately from `stats` being `null`/`undefined`. */
  isLoading: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={s.row(disabled)}>
      <Checkbox checked={checked} onChange={disabled ? undefined : onToggle} label={agent.name} />
      <span style={s.rowStats}>{formatAgentRowStats(stats, isLoading)}</span>
    </div>
  );
}
