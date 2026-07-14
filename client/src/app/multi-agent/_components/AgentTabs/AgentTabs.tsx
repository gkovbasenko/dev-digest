/* AgentTabs — one tab per agent (persona + finding-count), selecting a
   finding renders its detail (confidence + suggestion + action-row, AC-26).
   `AgentColumn.findings` is the narrow `AgentColumnFinding` projection (no
   confidence/rationale/suggestion) — the detail pane enriches the selected
   finding via `usePrReviews(result.pr_id)` (already-persisted FindingRecords
   for this PR, joined by finding id; see `helpers.ts`). The action row itself
   is NOT built here — `FindingDetailActions` (T11) is the single point of
   dependency for Accept/Dismiss/Turn-into-eval-case/Learn/Reply. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, SeverityBadge, CategoryTag, ConfidenceNum, Markdown, EmptyState, type Severity, type Category } from "@devdigest/ui";
import type { MultiAgentRun, AgentColumnFinding } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingDetailActions } from "../FindingDetailActions";
import { buildFindingLookup } from "./helpers";
import { s } from "./styles";

export function AgentTabs({ result }: { result: MultiAgentRun }) {
  const t = useTranslations("runs");
  const [agentId, setAgentId] = React.useState<string | null>(result.columns[0]?.agent_id ?? null);
  const [findingId, setFindingId] = React.useState<string | null>(null);

  const { data: reviews } = usePrReviews(result.pr_id);
  const lookup = React.useMemo(() => buildFindingLookup(reviews), [reviews]);

  const activeColumn = result.columns.find((c) => c.agent_id === agentId) ?? result.columns[0] ?? null;

  // A finding selected under one agent's tab has no meaning under another —
  // drop the selection when the active tab changes rather than carry a stale
  // (possibly id-colliding) selection across agents.
  const handleSelectAgent = (id: string) => {
    setFindingId(null);
    setAgentId(id);
  };

  if (result.columns.length === 0) return null;

  const tabs = result.columns.map((c) => ({ key: c.agent_id, label: c.agent_name, count: c.findings.length }));
  const selectedFinding: AgentColumnFinding | undefined = activeColumn?.findings.find(
    (f) => f.id === findingId,
  );
  const fullFinding = selectedFinding ? lookup.get(selectedFinding.id) : undefined;

  return (
    <div style={s.wrap}>
      <Tabs tabs={tabs} value={activeColumn?.agent_id ?? ""} onChange={handleSelectAgent} />
      {activeColumn?.summary ? (
        <div style={s.summary}>{activeColumn.summary}</div>
      ) : (
        <div style={s.summary}>{t("tabs.noSummary")}</div>
      )}
      <div style={s.body}>
        <div style={s.list}>
          {activeColumn && activeColumn.findings.length === 0 ? (
            <div style={s.empty}>{t("column.noFindings")}</div>
          ) : (
            activeColumn?.findings.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFindingId(f.id)}
                style={s.findingRow(f.id === findingId)}
              >
                <SeverityBadge severity={f.severity as Severity} compact />
                <span style={s.findingTitle} title={f.title}>
                  {f.title}
                </span>
                <span style={s.findingLoc}>
                  {f.file}:{f.start_line}
                </span>
              </button>
            ))
          )}
        </div>
        <div style={s.detail}>
          {!selectedFinding ? (
            <EmptyState icon="MessageSquare" title={t("tabs.selectFinding")} />
          ) : !fullFinding ? (
            <div style={s.empty}>{t("tabs.loadingDetail")}</div>
          ) : (
            <div style={s.detailBody}>
              <div style={s.detailHeader}>
                <SeverityBadge severity={fullFinding.severity as Severity} />
                <CategoryTag category={fullFinding.category as Category} />
              </div>
              <div style={s.detailTitle}>{fullFinding.title}</div>
              <div style={s.detailMeta}>
                <span className="mono" style={s.fileLoc}>
                  {fullFinding.file}:{fullFinding.start_line}
                </span>
                <ConfidenceNum value={fullFinding.confidence} />
              </div>
              <div style={s.prose}>
                <Markdown>{fullFinding.rationale}</Markdown>
              </div>
              {fullFinding.suggestion && (
                <div style={s.suggestionWrap}>
                  <div style={s.suggestionLabel}>{t("trace.suggestedFix")}</div>
                  <div style={s.prose}>
                    <Markdown>{fullFinding.suggestion}</Markdown>
                  </div>
                </div>
              )}
              <FindingDetailActions finding={fullFinding} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
