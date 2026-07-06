import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffViewer. */
export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 22,
  } satisfies CSSProperties,
  groupHeaderRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  } satisfies CSSProperties,
  groupDescription: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: "-8px 0 12px 22px",
  } satisfies CSSProperties,
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  findingsBadgeBtn: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    display: "inline-flex",
  } satisfies CSSProperties,
  headerOnlyCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headerOnlyIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  headerOnlyPath: {
    fontSize: 13,
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  headerOnlyStat: { fontSize: 12 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  empty: {
    padding: "24px",
    fontSize: 14,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
} as const;
