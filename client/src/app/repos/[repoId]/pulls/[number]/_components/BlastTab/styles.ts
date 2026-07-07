import type { CSSProperties } from "react";

/** Co-located styles for BlastTab. */
export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  viewToggle: {
    display: "flex",
    gap: 6,
  } satisfies CSSProperties,
  countRow: {
    display: "flex",
    gap: 24,
    padding: "14px 16px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  countItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  countValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  countLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  degradedBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  symbolList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  symbolBlock: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  symbolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  symbolBody: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "0 12px 12px 34px",
  } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  callerName: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
  graphPlaceholder: {
    padding: "60px 24px",
    textAlign: "center",
    fontSize: 14,
    color: "var(--text-muted)",
    border: "1px dashed var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  empty: {
    padding: "24px",
    fontSize: 14,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  priorPrsBlock: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  priorPrsHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  priorPrsTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  priorPrsBody: {
    display: "flex",
    flexDirection: "column",
    padding: "0 12px 12px",
  } satisfies CSSProperties,
  priorPrRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  priorPrNumber: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  priorPrTitle: {
    fontSize: 13,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  priorPrAuthor: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  priorPrsEmpty: {
    padding: "12px 0",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
