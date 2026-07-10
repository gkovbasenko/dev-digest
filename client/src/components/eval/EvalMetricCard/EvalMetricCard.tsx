/* EvalMetricCard — thin eval-domain wrapper over `@devdigest/ui`'s `MetricCard`
   (chart primitive). Adds the "no run yet" em-dash placeholder T6/T7 both need
   (RECALL / PRECISION / CITATION ACCURACY / TRACES PASSED cards). */
import React from "react";
import { MetricCard } from "@devdigest/ui";

/** `null`/`undefined` → "—" (no run yet); otherwise a rounded percentage. */
export function formatEvalPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function EvalMetricCard({
  label,
  value,
  delta,
  trend,
  color,
  percent = true,
  suffix,
}: {
  label: string;
  /** Raw metric value (0..1 for recall/precision/citation_accuracy) or a preformatted node. */
  value: React.ReactNode | number | null | undefined;
  delta?: number | null;
  trend?: number[];
  color?: string;
  /** When true (default) and `value` is a number, format as a rounded percentage. */
  percent?: boolean;
  suffix?: string;
}) {
  const hasValue = value != null;
  const display =
    typeof value === "number" ? (percent ? formatEvalPercent(value) : value) : value ?? "—";
  return (
    <MetricCard
      label={label}
      value={display}
      delta={hasValue ? delta ?? undefined : undefined}
      trend={hasValue ? trend : undefined}
      color={color}
      suffix={percent ? undefined : suffix}
    />
  );
}
