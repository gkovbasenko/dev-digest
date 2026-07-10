/* format.ts — tiny pure formatters shared across the /eval page's sibling
   components (AgentCardGrid, RecentRunsTable, AgentDetailView, CompareView).
   Kept flat (no folder) per the "atoms" allowance in the ui-architecture
   skill: too small to warrant their own component folder, used only within
   this one route tree. */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function formatCost(costUsd: number | null | undefined): string {
  if (costUsd == null) return "—";
  return `$${costUsd.toFixed(4)}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** "17/20 pass" (card footer copy) — em-dash when either side is unknown
    (never-run owner). */
export function formatPassFraction(passed: number | null | undefined, total: number | null | undefined): string {
  if (passed == null || total == null) return "—";
  return `${passed}/${total} pass`;
}

/** "17/20" (table-cell copy, under a "Pass" column header) — em-dash when
    either side is unknown. */
export function formatPassRatio(passed: number | null | undefined, total: number | null | undefined): string {
  if (passed == null || total == null) return "—";
  return `${passed}/${total}`;
}

/** Signed 2dp delta string for a nullable metric ("+0.05" / "-0.03" / "0.00" / "—"). */
export function formatSignedDelta(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}
