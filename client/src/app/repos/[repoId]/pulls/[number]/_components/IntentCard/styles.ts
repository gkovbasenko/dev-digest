import type { CSSProperties } from "react";

/** Co-located styles for IntentCard. */
export const s = {
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    lineHeight: 1.6,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    margin: 0,
    // Long paths/URLs in the intent must break, not overflow the column.
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  scopeList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    listStyle: "none",
    margin: 0,
    padding: 0,
  } satisfies CSSProperties,
  scopeItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  scopeText: {
    fontSize: 13.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    padding: "8px 4px",
  } satisfies CSSProperties,
  emptyTitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
