import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    margin: 0,
    paddingLeft: 18,
  } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  // Rationale is an LLM-generated sentence — wrap it, never a Badge (client
  // INSIGHTS 2026-07-07).
  rationale: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
