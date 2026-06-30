import type { CSSProperties } from "react";

/** Co-located styles for SeverityChips + FindingsHoverPreview. */
export const s = {
  chipsRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
  chip: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color,
    fontSize: 12.5,
    fontWeight: 600,
    lineHeight: 1,
  }),
  triggerWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
  } satisfies CSSProperties,
  popover: {
    position: "fixed",
    zIndex: 1000,
    minWidth: 340,
    maxWidth: 420,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
    padding: 12,
    cursor: "default",
  } satisfies CSSProperties,
  popoverHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 10,
  } satisfies CSSProperties,
  findingRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  findingRowFirst: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "0 0 8px",
  } satisfies CSSProperties,
  findingTitleLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  findingTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  findingMetaLine: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 11.5,
    color: "var(--text-muted)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  findingFile: {
    color: "var(--accent-text)",
    fontFamily:
      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: 11.5,
  } satisfies CSSProperties,
  findingConf: (zero: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color: zero ? "var(--text-muted)" : "var(--text-secondary)",
  }),
  findingExcerpt: {
    fontSize: 12,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  emptyHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
