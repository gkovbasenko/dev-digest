/* AgentColumns — one column per agent in the multi-agent run (AC-23/24/25/30).
   Header: agent name + live status (SSE, running→done/failed without reload)
   + score + duration + cost (null-safe, never "$NaN") + "View trace". Body:
   this agent's findings (title + severity), reusing the pre-staged
   `column.noFindings`/`column.findingsCount` i18n keys. Purely presentational
   plus one live-status subscription — everything else comes from the
   `columns` prop already resolved by the caller (`MultiAgentResult`). */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, SeverityBadge, CircularScore, type Severity, type IconName } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { useRunEvents } from "@/lib/hooks/reviews";
import { formatEstimateSeconds, formatEstimateCostUsd } from "../ConfigureRun/helpers";
import { liveColumnStatus, type ColumnStatus } from "./helpers";
import { s } from "./styles";

const STATUS_META: Record<ColumnStatus, { icon: IconName; color: string; bg: string }> = {
  running: { icon: "RefreshCw", color: "var(--accent)", bg: "var(--accent-bg)" },
  done: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)" },
};

export function AgentColumns({
  columns,
  onViewTrace,
}: {
  columns: AgentColumn[];
  /** Opens the (as-is) RunTraceDrawer for this column's run_id. */
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  // Only subscribe to streams for columns still running per the last fetch —
  // once the server settles a run, its id drops out here (the base status
  // itself already carries the outcome, no stream needed anymore).
  const runningRunIds = columns.filter((c) => c.status === "running").map((c) => c.run_id);
  const { events } = useRunEvents(runningRunIds);

  if (columns.length === 0) return null;

  return (
    <div style={s.grid}>
      {columns.map((col) => {
        const status = liveColumnStatus(col, events);
        const meta = STATUS_META[status];
        const statusLabel = t(`column.status.${status}`);
        return (
          <div key={col.run_id} style={s.column}>
            <div style={s.header}>
              <div style={s.nameRow}>
                <span style={s.name} title={col.agent_name}>
                  {col.agent_name}
                </span>
                <span role="status" aria-live="polite">
                  <Badge color={meta.color} bg={meta.bg} icon={meta.icon}>
                    {statusLabel}
                  </Badge>
                </span>
              </div>
              <div style={s.metaRow}>
                {col.score != null && <CircularScore score={col.score} size={26} stroke={3} />}
                <span style={s.metaText}>
                  {col.duration_ms != null ? formatEstimateSeconds(col.duration_ms) : t("stats.na")}
                </span>
                <span style={s.metaText}>
                  {col.cost_usd != null ? formatEstimateCostUsd(col.cost_usd) : t("stats.na")}
                </span>
              </div>
              <Button kind="ghost" size="sm" icon="ExternalLink" onClick={() => onViewTrace(col.run_id)}>
                {t("viewTrace")}
              </Button>
            </div>

            <div style={s.findings}>
              {col.findings.length === 0 ? (
                <div style={s.empty}>{t("column.noFindings")}</div>
              ) : (
                col.findings.map((f) => (
                  <div key={f.id} style={s.findingRow}>
                    <SeverityBadge severity={f.severity as Severity} compact />
                    <span style={s.findingTitle} title={f.title}>
                      {f.title}
                    </span>
                  </div>
                ))
              )}
              <div style={s.count}>{t("column.findingsCount", { count: col.findings.length })}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
