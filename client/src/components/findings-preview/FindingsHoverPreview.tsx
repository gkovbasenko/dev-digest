/* FindingsHoverPreview — popover that lists the top findings for the
   hovered context (one PR row in the list, or one timeline run on the PR
   detail). The popover is portalled to <body> so it escapes any ancestor
   `overflow: hidden` (e.g. the PR list table's rounded card). Position is
   `fixed`, computed from the trigger's bounding rect on hover. A short close
   timeout lets the cursor bridge the gap between trigger and popover without
   the popover flickering away. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

export type PreviewFinding = {
  id: string;
  severity: "CRITICAL" | "WARNING" | "SUGGESTION";
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale_excerpt: string;
};

const SEV_ICON: Record<PreviewFinding["severity"], { icon: IconName; color: string }> = {
  CRITICAL: { icon: "AlertOctagon", color: "var(--crit)" },
  WARNING: { icon: "AlertTriangle", color: "var(--warn)" },
  SUGGESTION: { icon: "Lightbulb", color: "var(--sugg)" },
};

const CATEGORY_ICON: Record<string, IconName> = {
  bug: "Bug",
  security: "Shield",
  perf: "Zap",
  style: "Code",
  test: "FlaskConical",
};

const POPOVER_MAX_WIDTH = 420;
const POPOVER_GAP_PX = 6;
const VIEWPORT_PADDING_PX = 8;
const CLOSE_DELAY_MS = 80;

function fileLineLabel(f: Pick<PreviewFinding, "file" | "start_line" | "end_line">): string {
  const range = f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
  return `${f.file}:${range}`;
}

export function FindingsHoverPreview({
  children,
  findings,
  totalCount,
  headerLabel,
  emptyLabel,
  moreLabel = "Open the PR to see all findings",
}: {
  children: React.ReactNode;
  findings: PreviewFinding[];
  totalCount: number;
  headerLabel: string;
  emptyLabel?: string;
  /** "Open the PR to see all findings" — shown when totalCount > findings.length. */
  moreLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeCoords = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(VIEWPORT_PADDING_PX, rect.left),
      window.innerWidth - POPOVER_MAX_WIDTH - VIEWPORT_PADDING_PX,
    );
    setCoords({ top: rect.bottom + POPOVER_GAP_PX, left });
  }, []);

  const show = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    computeCoords();
    setOpen(true);
  }, [computeCoords]);

  const scheduleClose = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, []);

  React.useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  if (totalCount === 0) return <>{children}</>;

  const popover =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            role="tooltip"
            style={{ ...s.popover, top: coords.top, left: coords.left }}
            onMouseEnter={show}
            onMouseLeave={scheduleClose}
          >
            <div style={s.popoverHeader}>
              <Icon.Info size={12} />
              {headerLabel}
            </div>
            {findings.length === 0 ? (
              <div style={s.emptyHint}>{emptyLabel ?? null}</div>
            ) : (
              <>
              {findings.map((f, i) => {
                const sev = SEV_ICON[f.severity];
                const SevI = Icon[sev.icon];
                const catName = CATEGORY_ICON[f.category];
                const CatI = catName ? Icon[catName] : null;
                return (
                  <div key={f.id} style={i === 0 ? s.findingRowFirst : s.findingRow}>
                    <div style={s.findingTitleLine}>
                      <SevI size={14} style={{ color: sev.color, flexShrink: 0 }} />
                      <span style={s.findingTitle}>{f.title}</span>
                      {CatI && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            fontSize: 11.5,
                            color: "var(--text-muted)",
                          }}
                        >
                          <CatI size={11} />
                          {f.category}
                        </span>
                      )}
                    </div>
                    <div style={s.findingMetaLine}>
                      <span style={s.findingFile}>{fileLineLabel(f)}</span>
                      <span style={s.findingConf(f.confidence === 0)}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 99,
                            background: sev.color,
                            display: "inline-block",
                          }}
                        />
                        {Math.round(f.confidence * 100)}% conf
                      </span>
                    </div>
                    {f.rationale_excerpt && (
                      <div style={s.findingExcerpt}>{f.rationale_excerpt}</div>
                    )}
                  </div>
                );
              })}
              {totalCount > findings.length && (
                <div style={s.moreRow}>
                  +{totalCount - findings.length} more — {moreLabel}
                </div>
              )}
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <span
      ref={triggerRef}
      style={s.triggerWrap}
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
      onFocus={show}
      onBlur={scheduleClose}
    >
      {children}
      {popover}
    </span>
  );
}
