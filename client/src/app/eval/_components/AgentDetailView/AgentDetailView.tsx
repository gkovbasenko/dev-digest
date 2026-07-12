/* AgentDetailView — Eval Dashboard agent-detail (AC-16/AC-17/AC-18/AC-19):
   metric cards with delta vs previous run + sparkline, a METRIC TREND
   LineChart, and a RECENT RUNS table whose Checkbox selection drives
   Compare (enabled only for exactly two selected runs). Compare replaces
   this view's body with the side-by-side CompareView — no re-run POST. */
"use client";

import React from "react";
import { Icon, LineChart, Button } from "@devdigest/ui";
import type { EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import { useRunAgentEvals } from "@/lib/hooks/eval";
import { EvalMetricCard } from "@/components/eval";
import { CompareView } from "../CompareView";
import { AgentRunsTable } from "./_components/AgentRunsTable";
import { trendSeries, passRateSeries } from "./helpers";
import { s } from "./styles";

export function AgentDetailView({
  agentId,
  agentName,
  dashboard,
  runs,
  onBack,
}: {
  agentId: string;
  agentName: string;
  dashboard: EvalDashboard;
  runs: EvalRunRecord[];
  onBack: () => void;
}) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const runEval = useRunAgentEvals();

  const toggleRun = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedRuns = selectedIds
    .map((id) => runs.find((r) => r.id === id))
    .filter((r): r is EvalRunRecord => r != null);
  const compareDisabled = selectedIds.length !== 2;

  if (compareOpen && selectedRuns.length === 2) {
    return (
      <CompareView
        a={selectedRuns[0]!}
        b={selectedRuns[1]!}
        agentName={agentName}
        onClose={() => setCompareOpen(false)}
      />
    );
  }

  const { current, delta, trend } = dashboard;

  return (
    <div style={s.wrap}>
      <div style={s.backRow}>
        <button type="button" style={s.back} onClick={onBack}>
          <Icon.ChevronLeft size={14} />
          Back to dashboard
        </button>
      </div>

      <div style={s.header}>
        <Icon.Cpu size={18} style={{ color: "var(--accent)" }} />
        <h1 style={s.h1}>{agentName}</h1>
        <div style={{ marginLeft: "auto" }}>
          <Button
            kind="primary"
            icon="Play"
            loading={runEval.isPending}
            disabled={runEval.isPending || dashboard.cases_total === 0}
            onClick={() => runEval.mutate(agentId)}
          >
            {runEval.isPending ? "Running…" : "Run eval"}
          </Button>
        </div>
      </div>

      {dashboard.alert && (
        <div role="alert" style={s.alert}>
          <Icon.AlertTriangle size={15} />
          <span>{dashboard.alert}</span>
        </div>
      )}

      <div style={s.cardsRow}>
        <EvalMetricCard
          label="RECALL"
          value={current.recall}
          delta={delta.recall}
          trend={trendSeries(trend, "recall")}
          color="var(--accent)"
        />
        <EvalMetricCard
          label="PRECISION"
          value={current.precision}
          delta={delta.precision}
          trend={trendSeries(trend, "precision")}
          color="var(--ok)"
        />
        <EvalMetricCard
          label="CITATION ACCURACY"
          value={current.citation_accuracy}
          delta={delta.citation_accuracy}
          trend={trendSeries(trend, "citation_accuracy")}
          color="var(--warn)"
        />
        <EvalMetricCard
          label="TRACES PASSED"
          value={current.traces_total > 0 ? `${current.traces_passed}/${current.traces_total}` : null}
          trend={passRateSeries(trend)}
          percent={false}
        />
      </div>

      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Metric trend</span>
          <div style={s.legend}>
            <span style={s.legendItem}>
              <span style={s.legendDot("var(--accent)")} />
              Recall
            </span>
            <span style={s.legendItem}>
              <span style={s.legendDot("var(--ok)")} />
              Precision
            </span>
            <span style={s.legendItem}>
              <span style={s.legendDot("var(--warn)")} />
              Citation
            </span>
          </div>
        </div>
        <LineChart
          yMin={0}
          series={[
            { name: "recall", color: "var(--accent)", data: trendSeries(trend, "recall") },
            { name: "precision", color: "var(--ok)", data: trendSeries(trend, "precision") },
            { name: "citation", color: "var(--warn)", data: trendSeries(trend, "citation_accuracy") },
          ]}
        />
      </div>

      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Recent runs</span>
          <Button kind="primary" size="sm" disabled={compareDisabled} onClick={() => setCompareOpen(true)}>
            {`Compare (${selectedIds.length})`}
          </Button>
        </div>
        <AgentRunsTable agentId={agentId} runs={runs} selectedIds={selectedIds} onToggle={toggleRun} />
      </div>
    </div>
  );
}
