# client — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-01 — Guard every mutation-triggering handler on `isPending`, not just the obvious one

`SkillsTab`'s `handleToggle` correctly checked `setAgentSkills.isPending` before firing a mutation, but `handleDragEnd` didn't — `draggable` rows have no built-in disabled state, so a user could drop a drag reorder while a toggle mutation from a moment earlier was still in flight, firing a second concurrent `setAgentSkills` mutation. Two in-flight mutations each carry a full order snapshot and each has its own `onError` rollback target (a `previousOrder`/`preDragOrderRef` snapshot) — whichever fails can revert to a snapshot that no longer agrees with the other's in-progress change, and the server itself just serializes whichever response lands last. Fixed by guarding `handleDragStart` on `isPending` (which also blocks `handleDragOver`, since it no-ops when `dragIndexRef.current` stays `null`), plus a defense-in-depth check in `handleDragEnd` itself.

Same anti-pattern recurred in `SkillPreview.tsx`'s `toggleEnabled`: it recomputes `!skill.enabled` from the `skill` prop (no optimistic update, only synced on the mutation's `onSuccess`), so two rapid clicks before the first mutation resolves both read the same stale value and send the identical patch — silently swallowing the second click's intent to toggle back. Fixed with the same `if (update.isPending) return;` guard.

**How to apply:** when a component has more than one gesture that can trigger the same mutation (a click AND a drag, for example), audit ALL of them for the pending guard — copying the guard onto only the first one you write is easy to forget for the others, especially when the second gesture (drag) is spread across three separate handlers (start/over/end) instead of one click handler. More generally: any handler that computes its mutation payload from a component *prop* (rather than a ref/local optimistic state) is vulnerable to this if there's no `isPending` guard, since the prop won't reflect an in-flight mutation's effect until it resolves.

**Evidence:** `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx` (`handleDragStart`/`handleDragEnd`), `SkillsTab.test.tsx`; `client/src/app/skills/_components/SkillsView/SkillPreview.tsx` (`toggleEnabled`), `SkillPreview.test.tsx` ("ignores a second click while the toggle mutation is still pending" test).

---

## 2026-07-01 — Optimistic list-membership state must derive `linkedIds` from local state, not server-truth, during the pending window

`SkillsTab` had `linkedIds` derived from `useAgentSkills()`'s `linkedLinks` (server truth), while `linkedSkills` (the "linked" list) was derived from `localOrder` (the optimistic local state updated immediately on toggle/drag, before the mutation resolves). Between clicking a checkbox and the mutation settling, `localOrder` is ahead of `linkedLinks` — so a just-linked skill showed up in BOTH the linked list (via `localOrder`) AND the unlinked list (via stale `linkedIds`) simultaneously, and a just-unlinked skill vanished from both. Fixed by deriving `linkedIds` from `localOrder` (`new Set(localOrder)`) so both derived lists agree on the same live source during the optimistic window.

**How to apply:** whenever a component keeps an optimistic local copy of "what's linked/selected," every other derived value that needs to agree with that list (counts, filters, exclusion sets) must be computed from the SAME optimistic source — never mix one derived value off local state and another off the not-yet-settled server data for the same conceptual membership set.

**Evidence:** `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx` (`linkedIds` memo), `SkillsTab.test.tsx` ("does not show a just-linked skill in both...(the optimistic window)" test); found incidentally while adding optimistic-rollback coverage — a test asserting `getAllByRole("checkbox")` returned 3 elements instead of the expected 2 surfaced it.

---

## 2026-07-01 — Mocking a TanStack Query hook with `() => ({ data: [] })` can OOM-crash the test worker

`SkillsTab` has `useEffect(() => { ...; setLocalOrder(...) }, [linkedLinks])`, relying on `useAgentSkills()`'s `data` keeping a stable reference across renders — which the real TanStack Query hook does once a query settles. `AgentEditor.test.tsx` originally mocked it as `useAgentSkills: () => ({ data: [] })`: a fresh `[]` literal is a new reference every call, so the effect's dependency check never bails out — effect runs → `setLocalOrder` → re-render → hook called again → new `[]` → effect runs again, forever. This doesn't reproduce in production (React Query memoizes `data`), only in tests with a naive per-call mock; it reliably drove the Vitest worker to `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` and crashed the whole run — not a test failure, so it's easy to mistake for an unrelated environment/OOM flake.

**How to apply:** when mocking a query hook that a component depends on via a `useEffect` dependency array, return a **stable, module-scoped** array/object reference (`vi.hoisted(() => ({ EMPTY: [] }))`, then `() => ({ data: EMPTY })`) — never a fresh literal per call. If a `useEffect` in a component takes `data` as a dependency, always ask whether the mock's `data` reference is stable across renders before assuming a hang/crash is unrelated to the mock.

**Evidence:** `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx` (`useEffect` keyed on `linkedLinks`), `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` (fixed via `vi.hoisted`); reproduced by running the file in isolation — `npx vitest run AgentEditor.test.tsx` hit the Node heap limit before the fix.

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
