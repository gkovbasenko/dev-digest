import type { CSSProperties } from "react";

export const s = {
  linkList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    margin: "12px 0 0",
    paddingLeft: 18,
  } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  rationale: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
