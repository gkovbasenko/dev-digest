/* SeverityChips — icon+count chips per severity. Zero-count severities are
   hidden so a clean PR shows nothing instead of "0 · 0 · 0". */
import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export type SeverityCounts = {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
};

const BUCKETS: { key: keyof SeverityCounts; color: string; icon: keyof typeof Icon }[] = [
  { key: "CRITICAL", color: "var(--crit)", icon: "AlertOctagon" },
  { key: "WARNING", color: "var(--warn)", icon: "AlertTriangle" },
  { key: "SUGGESTION", color: "var(--sugg)", icon: "Lightbulb" },
];

export function SeverityChips({
  counts,
  size = 13,
}: {
  counts: SeverityCounts;
  size?: number;
}) {
  const visible = BUCKETS.filter((b) => counts[b.key] > 0);
  if (visible.length === 0) return null;
  return (
    <span style={s.chipsRow}>
      {visible.map(({ key, color, icon }) => {
        const I = Icon[icon];
        return (
          <span key={key} style={s.chip(color)}>
            <I size={size} />
            {counts[key]}
          </span>
        );
      })}
    </span>
  );
}
