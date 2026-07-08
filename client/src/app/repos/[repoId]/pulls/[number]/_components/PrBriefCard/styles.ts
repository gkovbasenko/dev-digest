import type { CSSProperties } from "react";

/** Co-located styles for PrBriefCard. */
export const s = {
  loadingOrError: {
    padding: "24px",
    fontSize: 14,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  generateEmpty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    padding: "8px 4px",
  } satisfies CSSProperties,
  generateEmptyTitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  staleHint: {
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
  regenerateError: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 12px",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    borderRadius: 7,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  generatedAt: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  text: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    margin: 0,
    // LLM prose must break, not overflow the card.
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  riskList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  riskItem: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    padding: "10px 12px",
    minWidth: 0,
  } satisfies CSSProperties,
  riskHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,
  riskTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  // Sentence-length LLM explanation — a wrapping <p>, NEVER a Badge
  // (Badge is white-space: nowrap; see client/INSIGHTS.md 2026-07-07).
  explanation: {
    fontSize: 13.5,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    margin: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  fileRefRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  } satisfies CSSProperties,
  focusList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    margin: 0,
    paddingLeft: 20,
  } satisfies CSSProperties,
  focusItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  } satisfies CSSProperties,
  focusNote: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
