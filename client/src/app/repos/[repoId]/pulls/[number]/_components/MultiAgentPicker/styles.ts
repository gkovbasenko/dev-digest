import type { CSSProperties } from "react";

/** Co-located styles for MultiAgentPicker. The trigger renders a library
   Button; the popover panel (checkbox list + confirm footer) is bespoke,
   modeled on the vendor Dropdown panel look (border/shadow/radius tokens). */
export const s = {
  root: {
    position: "relative",
    display: "inline-block",
  } satisfies CSSProperties,
  panel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    width: 260,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 10,
    zIndex: 40,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 240,
    overflow: "auto",
  } satisfies CSSProperties,
  row: {
    padding: "6px 4px",
    borderRadius: 6,
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 4px",
  } satisfies CSSProperties,
  footer: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
