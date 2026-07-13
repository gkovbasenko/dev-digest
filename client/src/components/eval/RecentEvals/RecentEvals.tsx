/* RecentEvals — PR-detail "recent evals" summary (T8, AC-22). Shows the latest
   eval-run metrics for every agent that has reviewed THIS PR, scoped from the
   workspace-wide `useEvalDashboard()` (`?agentId=` is reserved for the
   agent-detail view owned by the Eval Dashboard, T7). Links out to `/eval`
   rather than duplicating it — the Eval Dashboard is the eval home surface.
   When none of this PR's agents have ever run an eval, renders an EmptyState
   prompt (never a zeroed chart — AC-22). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { SectionLabel, EmptyState, Button } from "@devdigest/ui";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { EvalMetricCard } from "../EvalMetricCard";
import { s } from "./styles";

function formatRunMeta(agent: {
  last_run_version: number | null;
  last_run_at: string | null;
  traces_passed: number | null;
  traces_total: number | null;
}): string {
  const parts: string[] = [];
  parts.push(agent.last_run_version != null ? `v${agent.last_run_version}` : "—");
  if (agent.last_run_at) parts.push(new Date(agent.last_run_at).toLocaleDateString());
  if (agent.traces_passed != null && agent.traces_total != null) {
    parts.push(`${agent.traces_passed}/${agent.traces_total} pass`);
  }
  return parts.join(" · ");
}

export interface RecentEvalsAgent {
  id: string;
  name: string;
}

/** `agents` — the (deduped) agents that have reviewed this PR, so the section
    only surfaces eval health for agents relevant to it, not the whole workspace. */
export function RecentEvals({ agents }: { agents: RecentEvalsAgent[] }) {
  const router = useRouter();
  const { data: dashboard, isLoading } = useEvalDashboard();

  const relevantIds = React.useMemo(() => new Set(agents.map((a) => a.id)), [agents]);
  const rows = (dashboard?.agents ?? []).filter((a) => relevantIds.has(a.agent_id));

  return (
    <section style={s.root}>
      <SectionLabel
        icon="FlaskConical"
        right={
          rows.length > 0 ? (
            <Button kind="tertiary" size="sm" onClick={() => router.push("/eval")}>
              Open Eval Dashboard →
            </Button>
          ) : undefined
        }
      >
        Recent evals
      </SectionLabel>

      {isLoading ? (
        <div style={s.loading}>Loading eval metrics…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="FlaskConical"
          title="No eval runs yet"
          body="Turn an accepted or dismissed finding into an eval case, then run it from the Eval Dashboard to track this agent's accuracy over time."
          cta="Open Eval Dashboard"
          onCta={() => router.push("/eval")}
        />
      ) : (
        <div style={s.list}>
          {rows.map((agent) => (
            <div key={agent.agent_id} style={s.agentCard}>
              <div style={s.agentHeader}>
                <span style={s.agentName}>{agent.agent_name}</span>
                <span style={s.agentMeta}>{formatRunMeta(agent)}</span>
              </div>
              <div style={s.metrics}>
                <EvalMetricCard label="RECALL" value={agent.recall} />
                <EvalMetricCard label="PRECISION" value={agent.precision} />
                <EvalMetricCard label="CITATION ACCURACY" value={agent.citation_accuracy} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
