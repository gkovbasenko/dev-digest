import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    margin: 0,
    paddingLeft: 18,
  } satisfies CSSProperties,
  codeBlock: {
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  copyRow: {
    display: "flex",
    justifyContent: "flex-end",
    padding: "4px 6px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
