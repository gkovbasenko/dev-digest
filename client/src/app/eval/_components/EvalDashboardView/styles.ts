import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  header: {} satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  alert: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    fontWeight: 550,
    marginBottom: 14,
  } satisfies CSSProperties,
} as const;
