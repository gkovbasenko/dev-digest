import type { EvalTrendPoint } from "@devdigest/shared";

/** Trend series feeding `EvalMetricCard`'s sparkline and the METRIC TREND
    LineChart — `null` points (no must_find region / no grounded citations
    that run) collapse to 0 so the line stays continuous. */
export function trendSeries(trend: EvalTrendPoint[], key: "recall" | "precision" | "citation_accuracy"): number[] {
  return trend.map((point) => point[key] ?? 0);
}

export function passRateSeries(trend: EvalTrendPoint[]): number[] {
  return trend.map((point) => point.pass_rate);
}
