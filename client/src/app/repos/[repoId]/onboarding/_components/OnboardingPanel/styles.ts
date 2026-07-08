import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  onThisPage: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    marginBottom: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  onThisPageLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  onThisPageLink: {
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
} as const;
