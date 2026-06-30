import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings, optionally filter by severity, and sort. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  activeSeverity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (activeSeverity) shown = shown.filter((f) => f.severity === activeSeverity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Count findings grouped by severity, respecting the low-confidence filter. */
export function countBySeverity(
  findings: FindingRecord[],
  hideLow: boolean,
): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (hideLow && f.confidence < LOW_CONFIDENCE_THRESHOLD) continue;
    if (f.severity in counts) counts[f.severity as Severity] += 1;
  }
  return counts;
}
