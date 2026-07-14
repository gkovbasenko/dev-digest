/* ConfigureRun — the `/multi-agent` page view (AC-5): hosts BOTH the
   Configure-run wizard (step 1 PR selector, step 2 agent checklist + pre-run
   estimate) and the Results area for the same PR's latest multi-agent group,
   transitioning Configure → Results automatically once a group exists
   (`useMultiAgentResult`). Columns/Tabs/disagree themselves are NOT built
   here (T10/T11) — this view only renders the stable "results slot" they
   mount into; see the comment above `s.resultsSlot` below. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useMultiAgentRun, useMultiAgentResult, useAgentsStats } from "@/lib/hooks/multi-agent";
import { useActiveRepo } from "@/lib/repo-context";
import { MultiAgentResults } from "../MultiAgentResults";
import { AgentChecklistRow } from "./AgentChecklistRow";
import {
  estimateMultiAgentRun,
  formatEstimateCostUsd,
  formatEstimateSeconds,
  type SelectedAgentEstimateInput,
} from "./helpers";
import { s } from "./styles";

export function ConfigureRun() {
  const t = useTranslations("runs");
  const router = useRouter();
  const search = useSearchParams();
  const { repoId } = useActiveRepo();

  const { data: pulls } = usePulls(repoId);
  const { data: agents } = useAgents();
  const enabledAgents = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);

  const prNumberParam = search.get("pr");
  const selectedPr = prNumberParam
    ? (pulls ?? []).find((p) => String(p.number) === prNumberParam) ?? null
    : null;
  const prId = selectedPr?.id ?? null;

  const [selectedAgentIds, setSelectedAgentIds] = React.useState<Set<string>>(new Set());
  // A different PR's checklist starts fresh — an agent selection made for one
  // PR shouldn't silently carry over and fire against another.
  React.useEffect(() => {
    setSelectedAgentIds(new Set());
  }, [prId]);

  // One stats query per ENABLED agent (not just selected ones — every row
  // needs its own history, AC-7/8). `useAgentsStats` shares the exact
  // queryKey/queryFn `useAgentStats` uses, so the cache entry is identical —
  // no duplicate fetch, no drifted retry/staleTime policy (see its doc
  // comment in `lib/hooks/multi-agent.ts`).
  const statsQueries = useAgentsStats(enabledAgents.map((a) => a.id));

  const toggleAgent = (agentId: string) => {
    if (!prId) return; // checklist is inert until a PR is chosen (AC-6)
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  const estimateInputs: SelectedAgentEstimateInput[] = enabledAgents
    .map((a, i) => ({
      agentId: a.id,
      stats: statsQueries[i]?.data ?? null,
      isLoading: statsQueries[i]?.isLoading ?? false,
    }))
    .filter((entry) => selectedAgentIds.has(entry.agentId));
  const estimate = estimateMultiAgentRun(estimateInputs);

  const triggerRun = useMultiAgentRun();
  const { data: result, isLoading: resultLoading } = useMultiAgentResult(prId);

  const handleSelectPr = (value: string) => {
    const sp = new URLSearchParams(search.toString());
    if (value) sp.set("pr", value);
    else sp.delete("pr");
    router.replace(`/multi-agent${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  const handleRun = () => {
    if (!prId || selectedAgentIds.size === 0 || triggerRun.isPending) return;
    triggerRun.mutate({ prId, agentIds: Array.from(selectedAgentIds) });
  };

  const prOptions = [
    { value: "", label: t("page.selectPr") },
    ...(pulls ?? []).map((p) => ({
      value: String(p.number),
      label: t("page.prItem", { number: p.number, title: p.title }),
    })),
  ];

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("page.title")}</h1>
          <p style={s.subtitle}>{t("page.subtitle")}</p>
        </div>

        <div style={s.section}>
          <div style={s.stepLabel}>{t("page.step1")}</div>
          <SelectInput value={prNumberParam ?? ""} onChange={handleSelectPr} options={prOptions} mono={false} />
        </div>

        {!prId && <EmptyState icon="GitPullRequest" title={t("page.pickPr")} />}

        <div style={s.section}>
          <div style={s.stepLabel}>{t("page.step2")}</div>
          {enabledAgents.length === 0 ? (
            <EmptyState icon="Users" title={t("page.noAgents.title")} body={t("page.noAgents.body")} />
          ) : (
            <div style={s.checklist}>
              {enabledAgents.map((agent, i) => (
                <AgentChecklistRow
                  key={agent.id}
                  agent={agent}
                  checked={selectedAgentIds.has(agent.id)}
                  disabled={!prId}
                  stats={statsQueries[i]?.data}
                  isLoading={statsQueries[i]?.isLoading ?? false}
                  onToggle={() => toggleAgent(agent.id)}
                />
              ))}
            </div>
          )}
        </div>

        {estimate.label && (
          <div style={s.estimate}>
            <span style={s.estimateLabel}>{estimate.label}</span>
            {estimate.incompleteMarker && <span style={s.incompleteMarker}>{estimate.incompleteMarker}</span>}
          </div>
        )}

        <div style={s.runRow}>
          <Button
            kind="primary"
            disabled={!prId || selectedAgentIds.size === 0}
            loading={triggerRun.isPending}
            onClick={handleRun}
          >
            {triggerRun.isPending ? t("page.running") : t("page.runAll", { count: selectedAgentIds.size })}
          </Button>
        </div>

        {prId && (
          <div style={s.resultsSection}>
            {resultLoading ? (
              <Skeleton height={160} />
            ) : !result ? (
              <EmptyState icon="Layers" title={t("page.noRun.title")} body={t("page.noRun.bodyReady")} />
            ) : (
              <>
                <div style={s.resultsMeta}>
                  {t("page.meta", {
                    count: result.agent_count,
                    duration: formatEstimateSeconds(result.total_duration_ms),
                    cost: result.total_cost_usd != null ? formatEstimateCostUsd(result.total_cost_usd) : t("stats.na"),
                  })}
                </div>
                {/* Results slot — STABLE mount point for T10 (AgentColumns +
                    AgentTabs + ModeToggle, consuming T11's action-row export).
                    Identified by `data-testid="multi-agent-results-slot"`;
                    `result` (the current `MultiAgentRun`) is already in scope
                    here for whatever T10/T11 render inside it. Do not rename
                    or relocate this container — Wave 4 edits land inside it. */}
                <div data-testid="multi-agent-results-slot" style={s.resultsSlot}>
                  <MultiAgentResults result={result} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
