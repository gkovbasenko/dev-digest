import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 20,
  } satisfies CSSProperties,
  headerTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
  } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginTop: 4,
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  staleHint: {
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 12px",
    margin: 0,
  } satisfies CSSProperties,
  retryHint: {
    fontSize: 13,
    color: "var(--crit)",
    margin: 0,
  } satisfies CSSProperties,
  retryLink: {
    background: "none",
    border: "none",
    padding: 0,
    color: "var(--crit)",
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
