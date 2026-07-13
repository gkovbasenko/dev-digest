import type { CSSProperties } from "react";

const GRID = "1fr 120px 90px 90px 90px 90px 90px";

export const s = {
  section: { marginTop: 28 } satisfies CSSProperties,
  title: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 10,
  } satisfies CSSProperties,
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
  agentCell: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: 550,
  } satisfies CSSProperties,
  cell: { textAlign: "right" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
