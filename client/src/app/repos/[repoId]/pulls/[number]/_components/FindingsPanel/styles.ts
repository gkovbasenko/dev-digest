import type { CSSProperties } from "react";

/** Co-located styles for FindingsPanel (extracted from inline styles). */
export const s = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  divider: {
    width: 1,
    height: 18,
    background: "var(--border)",
    margin: "0 2px",
  } satisfies CSSProperties,
  toggleGroup: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  counterGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  counterSeparator: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  counter: (color: string, active: boolean, disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: active ? color : "var(--border)",
    background: active ? color : "transparent",
    color: active ? "var(--bg-base)" : disabled ? "var(--text-muted)" : color,
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: "0.02em",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "background .12s, color .12s, border-color .12s",
  }),
  counterCount: { fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
