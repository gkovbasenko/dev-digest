import type { CSSProperties } from "react";

export const s = {
  page: {
    display: "flex",
    height: "calc(100vh - 52px)",
  } as CSSProperties,

  // Left panel
  left: {
    width: 320,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } as CSSProperties,

  leftHeader: {
    padding: "16px 16px 12px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } as CSSProperties,

  leftTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } as CSSProperties,

  leftList: {
    flex: 1,
    overflow: "auto",
    padding: "8px 8px",
  } as CSSProperties,

  // Skill list item
  item: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 8,
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    marginBottom: 2,
  }),

  itemMain: {
    flex: 1,
    minWidth: 0,
  } as CSSProperties,

  itemName: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as CSSProperties,

  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  } as CSSProperties,

  // Right panel
  right: {
    flex: 1,
    minWidth: 0,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  } as CSSProperties,

  // Skill preview
  preview: {
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    flex: 1,
  } as CSSProperties,

  previewHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  } as CSSProperties,

  previewTitle: {
    fontSize: 20,
    fontWeight: 700,
    flex: 1,
  } as CSSProperties,

  previewMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } as CSSProperties,

  untrustedNotice: {
    padding: "12px 16px",
    borderRadius: 8,
    background: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } as CSSProperties,

  previewActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
  } as CSSProperties,

  bodyLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 8,
  } as CSSProperties,
};
