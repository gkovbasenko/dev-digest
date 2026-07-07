import type { CSSProperties } from "react";

export const s = {
  /** Two-column Overview grid: Intent (left) + Blast Radius (right), top-aligned. */
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 24,
    alignItems: "start",
  } satisfies CSSProperties,
  column: {
    minWidth: 0,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
