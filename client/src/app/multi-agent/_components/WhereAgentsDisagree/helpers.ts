/* Pure helpers for WhereAgentsDisagree — column derivation + the "is this row
   actually a conflict" predicate used by the "Show only conflicts" toggle.

   The server matcher (`server/src/modules/reviews/multi-agent/conflicts.ts`)
   only ever pushes rows that already satisfy this predicate, so in practice
   every row in `MultiAgentRun.conflicts` is a disagreement. The client keeps
   its own copy of the rule (rather than trusting the input is pre-filtered)
   so the toggle behaves correctly against any `Conflict[]`, including a
   hand-built test fixture that mixes in a unanimous row on purpose. */
import type { Conflict } from "@devdigest/shared";

export interface ConflictAgentColumn {
  agentId: string;
  persona: string;
}

/** Stable column order: first-seen agent across all rows (top to bottom). */
export function collectConflictAgents(conflicts: Conflict[]): ConflictAgentColumn[] {
  const seen = new Map<string, string>();
  for (const conflict of conflicts) {
    for (const take of conflict.takes) {
      if (!seen.has(take.agent_id)) seen.set(take.agent_id, take.persona);
    }
  }
  return Array.from(seen.entries()).map(([agentId, persona]) => ({ agentId, persona }));
}

/** A row is a genuine disagreement when at least one agent flagged the
    location and at least one other (that also reviewed) did not, or when the
    flagging agents assigned divergent severities. Mirrors the server's
    `isConflict` check in `conflicts.ts`. */
export function isDivergentConflict(conflict: Conflict): boolean {
  const flagged = conflict.takes.filter((take) => take.verdict !== "ignored");
  const ignored = conflict.takes.filter((take) => take.verdict === "ignored");
  const severities = new Set(flagged.map((take) => take.verdict));
  return (flagged.length >= 1 && ignored.length >= 1) || severities.size > 1;
}
