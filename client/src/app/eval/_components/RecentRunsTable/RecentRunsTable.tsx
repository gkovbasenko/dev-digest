/* RecentRunsTable — "RECENT EVAL RUNS · ALL AGENTS" (AC-15/AC-22): the home
   surface for eval health on the Eval Dashboard's list view. One row per
   persisted `eval_runs` row across every agent, built with layout primitives
   (there is no Table primitive). Empty runs render an EmptyState prompt, not
   a zeroed chart (AC-22). */
import React from "react";
import { EmptyState } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { formatEvalPercent } from "@/components/eval";
import { formatCost, formatDate, formatPassRatio } from "../format";
import { s } from "./styles";

export function RecentRunsTable({
  runs,
  agentNameById,
}: {
  runs: EvalRunRecord[];
  agentNameById: Record<string, string>;
}) {
  return (
    <div style={s.section}>
      <div style={s.title}>Recent eval runs · all agents</div>
      {runs.length === 0 ? (
        <div style={s.tableCard}>
          <EmptyState
            icon="FlaskConical"
            title="No eval runs yet"
            body="Create an eval case for an agent and run its eval set to see results here."
          />
        </div>
      ) : (
        <div style={s.tableCard}>
          <div style={s.headRow}>
            <span>Agent</span>
            <span>Ran at</span>
            <span style={s.headCell}>Recall</span>
            <span style={s.headCell}>Precision</span>
            <span style={s.headCell}>Citation</span>
            <span style={s.headCell}>Pass</span>
            <span style={s.headCell}>Cost</span>
          </div>
          {runs.map((run) => (
            <div key={run.id} style={s.row}>
              <span style={s.agentCell}>{agentNameById[run.owner_id] ?? run.owner_id}</span>
              <span style={s.muted}>{formatDate(run.ran_at)}</span>
              <span className="tnum" style={s.cell}>{formatEvalPercent(run.recall)}</span>
              <span className="tnum" style={s.cell}>{formatEvalPercent(run.precision)}</span>
              <span className="tnum" style={s.cell}>{formatEvalPercent(run.citation_accuracy)}</span>
              <span className="tnum" style={s.cell}>{formatPassRatio(run.traces_passed, run.traces_total)}</span>
              <span className="tnum" style={s.cell}>{formatCost(run.cost_usd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
