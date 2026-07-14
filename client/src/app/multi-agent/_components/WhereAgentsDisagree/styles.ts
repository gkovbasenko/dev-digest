import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" } satisfies CSSProperties,
  toggleLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,

  table: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  headerRow: (agentCount: number): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `minmax(160px, 1.4fr) repeat(${Math.max(agentCount, 1)}, minmax(160px, 1fr))`,
    background: "var(--bg-elevated)",
    borderBottom: "1px solid var(--border)",
  }),
  headerCell: {
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  row: (agentCount: number): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `minmax(160px, 1.4fr) repeat(${Math.max(agentCount, 1)}, minmax(160px, 1fr))`,
    borderBottom: "1px solid var(--border)",
  }),
  locationCell: {
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  } satisfies CSSProperties,
  location: { fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  locationTitle: { fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  cell: {
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
    borderLeft: "1px solid var(--border)",
  } satisfies CSSProperties,
  ignored: { fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
