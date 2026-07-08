import type { CSSProperties } from "react";

export const s = {
  layout: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  list: {
    flex: "1 1 340px",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  rowItem: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  } satisfies CSSProperties,
  row: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 6,
    border: `1px solid ${active ? "var(--border-strong, var(--border))" : "var(--border)"}`,
    background: active ? "var(--bg-hover)" : "var(--bg-surface)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  }),
  rowPath: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  rowTokens: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  preview: {
    flex: "1 1 420px",
    minWidth: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 16,
    maxHeight: "70vh",
    overflow: "auto",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  previewHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  previewPath: {
    fontSize: 13,
    fontWeight: 600,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  footer: {
    marginTop: 16,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
