import type { CSSProperties } from "react";

export const s = {
  card: (muted: boolean): CSSProperties => ({
    borderRadius: 8,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderWidth: 1,
    background: "var(--bg-elevated)",
    padding: "14px 16px",
    opacity: muted ? 0.6 : 1,
    transition: "opacity .2s",
  }),
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: (dimmed: boolean): CSSProperties => ({
    fontSize: 14,
    fontWeight: 600,
    color: dimmed ? "var(--text-muted)" : "var(--text-primary)",
  }),
  acceptedTag: { fontSize: 12, fontWeight: 600, color: "var(--ok)" } satisfies CSSProperties,
  rejectedTag: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  } satisfies CSSProperties,
  snippet: {
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  editStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 10,
  } satisfies CSSProperties,
} as const;
