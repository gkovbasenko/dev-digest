import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } satisfies CSSProperties,
  header: { padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "8px 16px" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 8px",
    borderRadius: 8,
    marginBottom: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    cursor: "pointer",
  } satisfies CSSProperties,
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  rowName: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  rowResult: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  rowBadge: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  emptyBadge: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  rowActions: { display: "flex", alignItems: "center", gap: 2, flexShrink: 0 } satisfies CSSProperties,
} as const;
