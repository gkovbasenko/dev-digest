/* EvalDashboardView — /eval (AC-15/AC-22): the Eval Dashboard, the home
   surface for eval health. `?agentId=` (URL search param, mirrors the
   AgentEditor's `?tab=` pattern) switches between the agent-card-grid list
   view and a single agent's detail view. All server data flows through the
   T4 hooks (`useEvalDashboard`, `useAgentEvalRuns`) — no ad-hoc fetch. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon, Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard, useAgentEvalRuns } from "@/lib/hooks/eval";
import { useAgent } from "@/lib/hooks/agents";
import { AgentCardGrid } from "../AgentCardGrid";
import { RecentRunsTable } from "../RecentRunsTable";
import { AgentDetailView } from "../AgentDetailView";
import { buildAgentNameMap } from "./helpers";
import { s } from "./styles";

export function EvalDashboardView() {
  const router = useRouter();
  const search = useSearchParams();
  const agentId = search.get("agentId");

  const { data: dashboard, isLoading, isError, refetch } = useEvalDashboard(agentId);
  const { data: runs } = useAgentEvalRuns(agentId);
  const { data: agent } = useAgent(agentId);

  const selectAgent = (id: string | null) => {
    router.replace(id ? `/eval?agentId=${id}` : "/eval");
  };

  const crumb = [
    { label: "Skills Lab" },
    { label: "Eval Dashboard", href: agentId ? "/eval" : undefined },
    ...(agentId ? [{ label: agent?.name ?? "Agent" }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>Eval Dashboard</h1>
          <p style={s.subtitle}>Recall, precision and citation accuracy across every agent's eval set.</p>
        </div>

        {isLoading && (
          <div style={s.loadingStack}>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}

        {isError && <ErrorState body="Eval metrics could not be loaded." onRetry={() => refetch()} />}

        {!isLoading && !isError && dashboard && agentId && (
          <AgentDetailView
            agentId={agentId}
            agentName={agent?.name ?? agentId}
            dashboard={dashboard}
            runs={runs ?? []}
            onBack={() => selectAgent(null)}
          />
        )}

        {!isLoading && !isError && dashboard && !agentId && (
          <>
            {dashboard.alert && (
              <div role="alert" style={s.alert}>
                <Icon.AlertTriangle size={15} />
                <span>{dashboard.alert}</span>
              </div>
            )}
            <AgentCardGrid agents={dashboard.agents} onSelect={selectAgent} />
            <RecentRunsTable runs={dashboard.recent_runs} agentNameById={buildAgentNameMap(dashboard.agents)} />
          </>
        )}
      </div>
    </AppShell>
  );
}
