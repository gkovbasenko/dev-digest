import type { CSSProperties } from "react";

export const s = {
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
