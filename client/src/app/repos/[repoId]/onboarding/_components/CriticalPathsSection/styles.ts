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
  pathRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  openLink: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  // "why it matters" is an LLM-generated SENTENCE, not a short tag — never a
  // Badge (Badge is white-space: nowrap and spills over adjacent content;
  // client INSIGHTS 2026-07-07). overflowWrap lets it wrap normally.
  why: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
