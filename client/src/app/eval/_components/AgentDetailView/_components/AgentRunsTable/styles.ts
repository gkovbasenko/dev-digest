import type { CSSProperties } from "react";

const GRID = "28px 70px 130px 1fr 90px 80px";

export const s = {
  tableCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headRow: {
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 14,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  headCell: { textAlign: "right" } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 14,
    alignItems: "center",
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  metrics: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  metricBarEmpty: {
    display: "grid",
    gridTemplateColumns: "70px 1fr",
    alignItems: "center",
    gap: 10,
    padding: "3px 0",
  } satisfies CSSProperties,
  metricBarLabel: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  metricBarDash: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  cell: { textAlign: "right" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
} as const;
