/* FindingsPanel — severity counters + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { useTranslations } from "next-intl";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION, SEVERITY_BUCKETS, SEVERITY_COLOR } from "./constants";
import { countBySeverity, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [activeSeverity, setActiveSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const counts = React.useMemo(() => countBySeverity(findings, hideLow), [findings, hideLow]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, activeSeverity),
    [findings, hideLow, activeSeverity],
  );

  // If the active severity has zero matches after another filter change, clear it
  // so the user is not stuck on an empty view.
  React.useEffect(() => {
    if (activeSeverity && counts[activeSeverity] === 0) setActiveSeverity(null);
  }, [activeSeverity, counts]);

  // Reset keyboard focus when the visible set changes.
  React.useEffect(() => {
    setFocusIdx(0);
  }, [activeSeverity, hideLow]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  const toggleSeverity = (sev: Severity) =>
    setActiveSeverity((prev) => (prev === sev ? null : sev));

  return (
    <div>
      <div style={s.toolbar}>
        <div
          style={s.counterGroup}
          role="group"
          aria-label={t("panel.severityFilterLabel")}
        >
          {SEVERITY_BUCKETS.map((sev, i) => {
            const count = counts[sev];
            const disabled = count === 0;
            const active = activeSeverity === sev;
            return (
              <React.Fragment key={sev}>
                {i > 0 && (
                  <span aria-hidden="true" style={s.counterSeparator}>
                    ·
                  </span>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  aria-label={t("panel.severityFilterChip", { count, severity: sev })}
                  onClick={() => toggleSeverity(sev)}
                  style={s.counter(SEVERITY_COLOR[sev], active, disabled)}
                >
                  <span style={s.counterCount}>{count}</span>
                  <span>{sev}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
