import type { CSSProperties } from "react";

/** Co-located styles for the SkillDetail shell. Mirrors the AgentEditor
 *  shell's `body`/`tabBody` distinction: `body` is for simple scrollable
 *  content that has no padding of its own; `tabBody` is for tabs that manage
 *  their own layout (padding, header, scroll) already. */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28 } satisfies CSSProperties,
  // SkillPreview (Config tab) already applies its own 28px padding, and
  // VersionsTab manages its own sticky header + scrollable list — both use
  // this instead, to avoid doubling up on padding/scroll containers.
  tabBody: { flex: 1, overflow: "auto", display: "flex", flexDirection: "column", minHeight: 0 } satisfies CSSProperties,
} as const;
