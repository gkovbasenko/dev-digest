import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  toolbar: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
