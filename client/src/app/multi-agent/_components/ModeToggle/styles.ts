import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  btn: (active: boolean): CSSProperties => ({
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    background: active ? "var(--bg-surface)" : "transparent",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  }),
} as const;
