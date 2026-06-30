# client — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-06-30 — PR-list `tableCard` clips per-row overlays; portal them to `<body>`

The PR-list table card sets `overflow: hidden` to mask its rounded corners. Any `position: absolute` overlay rendered inside a row (popover, dropdown, tooltip, composer) gets **clipped the moment it drops below the row's content box**. The bug is silent: the trigger works, but the floating content is partly or fully invisible.

**Why:** the rounded-corner masking is intentional — removing `overflow: hidden` leaves the last row's bottom border bleeding outside the rounded card. Don't remove it.

**How to apply:** for any overlay that may extend past its row in this table (or any future similar table card), render via `createPortal(..., document.body)` with `position: fixed`, computing coordinates from the trigger's `getBoundingClientRect()`. Clamp to viewport for the right edge. Use a short close-delay so the cursor can bridge trigger → overlay without flicker. See `FindingsHoverPreview.tsx` as the reference implementation.

**Evidence:** `client/src/app/repos/[repoId]/pulls/styles.ts:92-98` (tableCard `overflow: hidden`), `client/src/components/findings-preview/FindingsHoverPreview.tsx` (portal pattern), discovered while wiring the PR-list severity-chip hover preview.
