/** Compact relative time for the onboarding header's "last refreshed" line
 *  (e.g. "3h ago", "2d ago"). Mirrors the pulls list's relativeTime shape but
 *  is spelled out ("3h ago" vs "3h") since this is prose, not a table column. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
