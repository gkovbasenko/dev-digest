# client — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-01 — `AgentEditor` body container has `padding: 28`; tabs with internal scroll need `tabBody` instead

`s.body` in `AgentEditor/styles.ts` applies `padding: 28` and `overflow: auto` — fine for `ConfigTab`, which renders a scrollable form inside. Any tab that manages its own internal scroll and padding (e.g. `SkillsTab` with a sticky header, scrollable list, and sticky footer) must use `s.tabBody` instead: `{ flex: 1, overflow: auto, display: flex, flexDirection: column, minHeight: 0 }` — no outer padding, so the tab controls its own layout without double-padding.

**How to apply:** when adding a new tab to `AgentEditor`, use `s.body` for simple scrollable forms; use `s.tabBody` for tabs that define their own header/list/footer layout. See `AgentEditor.tsx` for the conditional render pattern.

**Evidence:** `client/src/app/agents/[id]/_components/AgentEditor/styles.ts` (`s.body` and `s.tabBody`), `AgentEditor.tsx` (conditional tab rendering), PR #6.

---

## 2026-07-01 — `icons.tsx` is an explicit allowlist; new Lucide icons must be added before use

`client/src/vendor/ui/icons.tsx` exports only the icons it explicitly imports from `lucide-react` — it is not a pass-through of the full Lucide library. Using an icon name that isn't in the registry compiles fine (TypeScript uses `IconName = keyof typeof Icon`) but the icon reference is simply missing. `BookOpen` and `GripVertical` were absent and had to be added to both the import list and the `Icon` object before they could be used in the nav and `SkillsTab`.

**How to apply:** before referencing a new icon by name anywhere in the codebase, check `icons.tsx` and add the import + registry entry if missing. The `satisfies Record<string, LucideIcon>` on the `Icon` object ensures the type stays correct.

**Evidence:** `client/src/vendor/ui/icons.tsx` (BookOpen and GripVertical added in PR #6), TypeScript `IconName` type is derived from the registry keys.

---

## 2026-06-30 — PR-list `tableCard` clips per-row overlays; portal them to `<body>`

The PR-list table card sets `overflow: hidden` to mask its rounded corners. Any `position: absolute` overlay rendered inside a row (popover, dropdown, tooltip, composer) gets **clipped the moment it drops below the row's content box**. The bug is silent: the trigger works, but the floating content is partly or fully invisible.

**Why:** the rounded-corner masking is intentional — removing `overflow: hidden` leaves the last row's bottom border bleeding outside the rounded card. Don't remove it.

**How to apply:** for any overlay that may extend past its row in this table (or any future similar table card), render via `createPortal(..., document.body)` with `position: fixed`, computing coordinates from the trigger's `getBoundingClientRect()`. Clamp to viewport for the right edge. Use a short close-delay so the cursor can bridge trigger → overlay without flicker. See `FindingsHoverPreview.tsx` as the reference implementation.

**Evidence:** `client/src/app/repos/[repoId]/pulls/styles.ts:92-98` (tableCard `overflow: hidden`), `client/src/components/findings-preview/FindingsHoverPreview.tsx` (portal pattern), discovered while wiring the PR-list severity-chip hover preview.
