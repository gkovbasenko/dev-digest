import type { CSSProperties } from "react";

/** Co-located styles for the CI Runs page table view. */
export const s = {
  wrap: { padding: "24px 28px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
  tableCard: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  headRow: {
    display: "grid",
    gridTemplateColumns: "90px minmax(0,1.4fr) minmax(0,1fr) 110px 90px 90px 90px 70px",
    gap: 10,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  headCell: { textAlign: "right" } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "90px minmax(0,1.4fr) minmax(0,1fr) 110px 90px 90px 90px 70px",
    gap: 10,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    alignItems: "center",
    fontSize: 13,
  } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono)", fontSize: 12, overflowWrap: "anywhere", minWidth: 0 } satisfies CSSProperties,
  cell: { textAlign: "right", color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
