import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 22, padding: "20px 24px" } satisfies CSSProperties,

  // ---- metric tiles -------------------------------------------------------
  tiles: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "14px 16px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  tileRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  tileOld: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  tileArrow: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  tileNew: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" } satisfies CSSProperties,
  delta: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: 700,
    color,
  }),

  // ---- system prompt diff -------------------------------------------------
  diffSection: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  diffHead: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  diffTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  legendChip: (bg: string): CSSProperties => ({ width: 10, height: 10, borderRadius: 3, background: bg }),
  diffBox: {
    margin: 0,
    padding: "10px 0",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    overflowX: "auto",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: 12.5,
    lineHeight: 1.55,
  } satisfies CSSProperties,
  diffLine: (type: "same" | "add" | "del"): CSSProperties => ({
    display: "block",
    padding: "1px 16px 1px 28px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    position: "relative",
    color: type === "same" ? "var(--text-secondary)" : "var(--text-primary)",
    background:
      type === "add"
        ? "color-mix(in srgb, var(--ok) 14%, transparent)"
        : type === "del"
          ? "color-mix(in srgb, var(--crit) 12%, transparent)"
          : "transparent",
  }),
  diffSign: {
    position: "absolute",
    left: 10,
    color: "var(--text-muted)",
    userSelect: "none",
  } satisfies CSSProperties,
  diffEmpty: {
    padding: "18px 16px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // ---- footer -------------------------------------------------------------
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
