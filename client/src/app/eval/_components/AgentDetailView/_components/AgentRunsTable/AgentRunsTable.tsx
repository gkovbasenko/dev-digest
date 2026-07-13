/* AgentRunsTable — the agent-detail "RECENT RUNS" table (AC-16/AC-17): a
   selectable Checkbox per row (drives Compare, exactly-two-enabled), a
   VERSION link back to the agent editor, per-metric BarRow, PASS P/T, COST. */
import React from "react";
import { Checkbox, MonoLink, BarRow } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { formatEvalPercent } from "@/components/eval";
import { formatCost, formatDate, formatPassRatio } from "../../../format";
import { s } from "./styles";

function MetricBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) {
    return (
      <div style={s.metricBarEmpty}>
        <span style={s.metricBarLabel}>{label}</span>
        <span style={s.metricBarDash}>—</span>
      </div>
    );
  }
  return <BarRow label={label} value={value} max={1} suffix={formatEvalPercent(value)} />;
}

export function AgentRunsTable({
  agentId,
  runs,
  selectedIds,
  onToggle,
}: {
  agentId: string;
  runs: EvalRunRecord[];
  selectedIds: string[];
  onToggle: (runId: string) => void;
}) {
  return (
    <div style={s.tableCard}>
      <div style={s.headRow}>
        <span aria-hidden="true" />
        <span>Version</span>
        <span>Ran at</span>
        <span>Metrics</span>
        <span style={s.headCell}>Pass</span>
        <span style={s.headCell}>Cost</span>
      </div>
      {runs.map((run) => (
        <div key={run.id} style={s.row}>
          <Checkbox
            checked={selectedIds.includes(run.id)}
            onChange={() => onToggle(run.id)}
            label={<span style={s.srOnly}>{`Select run v${run.owner_version} from ${formatDate(run.ran_at)} for compare`}</span>}
          />
          <MonoLink href={`/agents/${agentId}`}>{`v${run.owner_version}`}</MonoLink>
          <span style={s.muted}>{formatDate(run.ran_at)}</span>
          <div style={s.metrics}>
            <MetricBar label="Recall" value={run.recall} />
            <MetricBar label="Precision" value={run.precision} />
            <MetricBar label="Citation" value={run.citation_accuracy} />
          </div>
          <span className="tnum" style={s.cell}>{formatPassRatio(run.traces_passed, run.traces_total)}</span>
          <span className="tnum" style={s.cell}>{formatCost(run.cost_usd)}</span>
        </div>
      ))}
    </div>
  );
}
