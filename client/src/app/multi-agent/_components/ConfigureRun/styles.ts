import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  header: {} satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,

  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  stepLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,

  checklist: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  row: (disabled: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "10px 14px",
      background: "var(--bg-elevated)",
      opacity: disabled ? 0.55 : 1,
    }) satisfies CSSProperties,
  rowStats: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,

  estimate: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  estimateLabel: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  incompleteMarker: { color: "var(--text-muted)" } satisfies CSSProperties,

  runRow: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,

  resultsSection: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  resultsMeta: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  resultsSlot: { display: "flex", flexDirection: "column", gap: 14, minHeight: 0 } satisfies CSSProperties,
} as const;
