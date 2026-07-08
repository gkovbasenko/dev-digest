import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 16px",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)" } satisfies CSSProperties,
  title: { fontWeight: 600, fontSize: 14 } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    color: "var(--text-muted)",
  }),
  body: { padding: "0 16px 16px" } satisfies CSSProperties,
} as const;
