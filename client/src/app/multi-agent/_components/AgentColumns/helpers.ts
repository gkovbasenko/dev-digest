/* helpers.ts — pure derivation for AgentColumns (AC-23/24/30). No React, no
   data fetching: `liveColumnStatus` folds accumulated SSE `RunEvent`s onto a
   column's persisted `status` so a running column flips to done/failed the
   moment its stream reports a terminal event, without waiting for the next
   `useMultiAgentResult` poll (AC-24). The server already maps a cancelled
   run to `AgentColumn.status: 'failed'` (no 'cancelled' in the contract) —
   this file only ever renders 'failed' as "errored" (AC-30). */

export type ColumnStatus = "done" | "failed" | "running";

/** Minimal event shape this file depends on — matches `RunEvent` from
    `@devdigest/shared` (`runId`, `kind`) without importing the full contract
    here, keeping this helper trivially unit-testable. */
export interface ColumnStatusEvent {
  runId: string;
  kind: string;
}

/** A column stays 'running' until either its own base status settles (next
    poll) or its stream emits a terminal event for its `run_id` — whichever
    comes first. Scans newest-first so only the LATEST terminal event for this
    run decides the outcome. */
export function liveColumnStatus(
  base: { run_id: string; status: ColumnStatus },
  events: ColumnStatusEvent[],
): ColumnStatus {
  if (base.status !== "running") return base.status;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || e.runId !== base.run_id) continue;
    if (e.kind === "result") return "done";
    if (e.kind === "error") return "failed";
  }
  return "running";
}
