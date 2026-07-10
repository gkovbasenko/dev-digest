# client — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-10 — AgentEditor tabs have TWO sources of truth: adding to `TABS` renders the tab but a missing `VALID_TABS` entry makes it un-openable, and component tests can't catch it

The editor tab bar is driven by `TABS` (`AgentEditor/constants.ts`), but the active tab is gated a SECOND time in the page: `const tab = VALID_TABS.includes(search.get("tab") ?? "") ? … : "config"` (`client/src/app/agents/[id]/page.tsx:15,27`). Add a tab to `TABS` only → the tab button renders and `setTab` pushes `?tab=<key>`, but the page reads it back through `VALID_TABS`, doesn't find the key, and falls back to `"config"` — so the new tab is visible yet **can never open** (URL flips to `?tab=evals`, content stays Config). `AgentEditor.test.tsx` passes `tab="evals"` as a prop directly, bypassing the page-level gate, so typecheck + unit tests stay green while the live app is broken. Only driving the real page (click the tab, observe it doesn't switch) surfaces it. When adding an editor tab, update BOTH `TABS` and `VALID_TABS`.

**Evidence:** this session (2026-07-10); the Eval Pipeline's `evals` tab was added to `TABS` but not `VALID_TABS`; found by driving `/agents/:id?tab=evals` in a browser (tab stayed on Config); one-line fix `VALID_TABS = [...,"evals"]` at `page.tsx:15`.

## 2026-07-08 — A *runtime* (value) import from the `@devdigest/shared` barrel breaks the client webpack build; every prior import was type-only

`client/src/vendor/shared/index.ts` re-exports every contract with `.js` specifiers (`export * from './contracts/findings.js'`). Until now **every** client import from `@devdigest/shared` was `import type` (64 of them) — erased before webpack ever runs, so the barrel was never bundled at runtime and its `.js`→`.ts` resolution was never exercised. The Project Context tabs added the FIRST *value* import (`import { PER_DOC_TOKEN_CAP } from "@devdigest/shared"`), which forced webpack to bundle the barrel → `Module not found: Can't resolve './contracts/findings.js'` for the whole re-export chain, 500-ing **every** route (both `next dev` and `next build`). `tsc` and `vitest` do NOT catch this — they resolve `.js`→`.ts` themselves, so typecheck + unit tests stay green while the app won't compile.

**How to apply:** import runtime *values* (Zod schemas, constants like the token caps) from the specific contract module via the `@devdigest/shared/*` path alias (e.g. `@devdigest/shared/contracts/context`), NOT the bare barrel — this both sidesteps the `.js`-chain resolution and avoids bundling every contract into the client for a couple of constants. Reserve the bare `@devdigest/shared` barrel for `import type` only. (A webpack `extensionAlias` `.js`→`.ts` in `next.config.mjs` would also fix resolution, but the subpath import is lighter and keeps the bundle lean.)

**Evidence:** `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` and `client/src/app/skills/_components/SkillsView/SkillContextTab.tsx` (caps now imported from `@devdigest/shared/contracts/context`); `next build` failure import-trace pointed at `ContextTab.tsx` → `vendor/shared/index.ts`; this session (2026-07-08), surfaced when the running dev app 500-ed on the skills page.

## 2026-07-07 — `Badge` is `white-space: nowrap`; never use it for sentence-length content, especially inside a grid column

`vendor/ui/primitives/Badge.tsx` hard-codes `whiteSpace: "nowrap"` (with default `overflow: visible`). A Badge wrapping a short tag is fine, but a Badge wrapping a full sentence renders as one unbroken line as wide as the sentence — and since a CSS grid track (`gridTemplateColumns: minmax(0,1fr) minmax(0,1fr)`) has a fixed width, the overflow doesn't widen the track, it **visually spills over and paints on top of the adjacent column**. This bit the PR Overview when Intent + Blast Radius became two columns: `IntentCard` rendered `in_scope`/`out_of_scope` (LLM-generated *sentences*, e.g. "Return 429 with Retry-After header") as Badges, which overlapped the Blast panel. It looked fine before only because Intent was full-width. Fixed by rendering scope items as a wrapping ✓/✗ checklist (`overflowWrap: "anywhere"`) instead of Badges.

**How to apply:** Badge = short label/tag only. For any variable-length or user/LLM-generated string, use a text element with `overflowWrap: "anywhere"` and `minWidth: 0` on its flex/grid ancestors. When moving a previously full-width panel into a grid column, audit it for `nowrap` content (Badges, `MonoLink` paths) that had room before but now overflows.

**Evidence:** `client/src/vendor/ui/primitives/Badge.tsx` (`whiteSpace: "nowrap"`), `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx` (`ScopeList` replacing the scope Badges), `OverviewTab/styles.ts` (`columns` grid); reported as "Intent text overrides Blast panel" this session.

## 2026-07-06 — SmartDiffViewer's patch join reuses `usePullDetail`; it is NOT a new staleness surface, and the patch must not be duplicated into the smart-diff response

`SmartDiffViewer` joins each file's `patch` from `usePullDetail(prId).files` by path (the `/pulls/:id/smart-diff` payload is deliberately patch-less). A review flagged this as a "stale / wrong-PR patch" bug (80% conf). It isn't: `usePullDetail` is keyed `["pull", prId]` with `prId` a stable per-PR uuid (`lib/hooks/core.ts:116`), so it can never return a *different* PR's data — the "from a different PR entirely" premise is false. And the **Original**-order diff already renders from the same `usePullDetail` files (`DiffTab.tsx:15,83`, sourced in `page.tsx`), so Smart order adds no source the page didn't already depend on. Residual same-PR staleness (PR force-pushed, cache not yet refetched) is shared with the Original view and self-heals via TanStack refetch (`refetchOnWindowFocus` + 60s interval on the sibling pull queries).

**How to apply:** do NOT "fix" this by putting `patch` into the smart-diff response — it duplicates large patch text the page already holds (reversing the intentional light-payload design) and wouldn't remove cross-query skew anyway, since the Original view still needs `usePullDetail`. Contrast with the *severity* overlay, which WAS moved into the response — that was a genuine second source of truth (which review's findings), whereas the patch has exactly one canonical source already.

**Evidence:** `lib/hooks/core.ts:116` (`["pull", prId]` key), `_components/DiffTab/DiffTab.tsx:15,83` (Original view uses the same `files`), `components/smart-diff-viewer/SmartDiffViewer.tsx` (`usePullDetail` join); rejected review finding, 2026-07-06.

## 2026-07-02 — `getByDisplayValue` silently fails on multi-line `<textarea>` values because RTL's default normalizer collapses whitespace

Testing Library's default text normalizer (used by `getByDisplayValue` too, not just `getByText`/`getByPlaceholderText`) collapses all whitespace — including embedded newlines — to single spaces before matching. Asserting `getByDisplayValue(multiLineString)` against a real controlled `<textarea>` whose `.value` contains `\n` therefore never matches, even though the rendered DOM's actual value is byte-identical to the string you passed in (confirmed via the query's own DOM dump in the failure output).

**How to apply:** for any expected value containing a newline (skill/rule bodies, JSON, code snippets), don't use `getByDisplayValue`/`getByText` with the raw multi-line string. Either query the element directly (e.g. `container.querySelector("textarea")!.value`) and assert equality, or pass `{ normalizer: getDefaultNormalizer({ collapseWhitespace: false }) }`. This is the same normalizer class of bug as the `getByPlaceholderText` gotcha already used elsewhere in this codebase — check for embedded `\n` first whenever a multi-line RTL query mysteriously "can't find" an element that's visibly right there in the debug dump.

**Evidence:** `client/src/app/repos/[repoId]/conventions/_components/BundleSkillModal/BundleSkillModal.test.tsx` (`prefills name/description/body from the bundle result on mount` — `getByDisplayValue(BUNDLE_RESULT.body)` failed with a full DOM dump showing the matching `<textarea>` right there; fixed via `container.querySelector("textarea")?.value`).

## 2026-07-02 — `Markdown` (`vendor/ui/primitives/Markdown.tsx`) is safe against raw-HTML injection, but link hrefs need explicit scheme sanitization

`Markdown` uses `react-markdown` with only `remarkGfm` — no `rehype-raw` plugin (not even installed: check `client/package.json` before assuming otherwise). Without `rehype-raw`, raw HTML in the markdown source (`<script>`, `<img onerror=...>`) is rendered as literal escaped text, never executed — verified with actual `<script>`/`<img onerror>` payloads through the real component, not just by reading the plugin list. This makes it safe by default for untrusted content (e.g. imported skill bodies). It does NOT sanitize link URL schemes on its own though — the custom `a` renderer passed `href` straight through to a real `<a>` tag, so a `[click](javascript:...)` or `[click](data:text/html,...)` link in untrusted markdown would still execute on click. Fixed with a `safeHref()` allowlist (http/https/mailto only) in the `a` renderer.

**How to apply:** when reviewing "does X markdown renderer allow XSS," check for `rehype-raw` (or equivalent raw-HTML-passthrough plugin) specifically — its absence is the actual safety boundary, not "react-markdown is generally safe." Separately, always verify link scheme handling in any custom link renderer; `react-markdown` itself does not strip dangerous schemes.

**Update 2026-07-07:** the boundary is now EXPLICIT — `Markdown.tsx` passes `rehypePlugins={[rehypeSanitize]}` (default GitHub allowlist), so HTML is sanitized at the AST level even if `rehype-raw` is ever added later. `safeHref` is kept as an independent second layer on link hrefs. So "safety = absence of rehype-raw" is no longer the whole story: it's now sanitize (raw HTML) + safeHref (link schemes). Rationale: a PR-review finding correctly noted that relying on a plugin's *absence* is an implicit guarantee, not an enforced one, for a renderer fed untrusted (imported/extracted) skill bodies.

**Evidence:** `client/src/vendor/ui/primitives/Markdown.tsx` (`rehypeSanitize` + `safeHref`), `Markdown.test.tsx` (raw-HTML-not-rendered tests, href-sanitization tests, and a "legitimate content still renders after sanitization" regression test); `client/package.json` has `react-markdown`, `rehype-sanitize`, and no `rehype-raw`.

---

## 2026-07-02 — Confirming before a `key`-remount discards child state needs a ref+callback, not lifted state

`SkillsView` renders `<SkillPreview key={selectedSkill.id} skill={selectedSkill} />` — switching skills remounts a fresh `SkillPreview` instance (correct, since editor state shouldn't carry over between skills). But this means the PARENT can't simply check the child's `editing`/`body` state before allowing a switch — by the time a click handler in the parent would want to ask "is there an unsaved edit?", the relevant state lives in a component instance about to be discarded, and the parent has no synchronous way to inspect it. The fix: `SkillPreview` takes an `onDirtyChange?: (dirty: boolean) => void` prop and reports `editing && body !== skill.body` via a `useEffect` (also firing on unmount, so a stale `true` can't outlive the instance); the parent stores this in a `ref` (not state — it's only read at click time, not rendered) and checks the ref before calling `setSelected(id)`, showing `window.confirm(...)` if dirty.

**How to apply:** any time a parent needs to know about "is there unsaved work in a child that's about to unmount via a `key` change," lift a `dirty` signal via a callback prop into a ref (to avoid extra re-renders), not by trying to read the child's state directly — there's no direct-read path once you're deciding whether to trigger the remount in the first place.

**Evidence:** `client/src/app/skills/_components/SkillsView/SkillPreview.tsx` (`onDirtyChange` prop, `isDirty` effect), `client/src/app/skills/_components/SkillsView/SkillsView.tsx` (`isDirtyRef`, `handleSelectSkill`), `SkillPreview.test.tsx` ("onDirtyChange" describe block), `SkillsView.test.tsx` ("confirm before discarding an unsaved edit" describe block).

---

## 2026-07-01 — Mutation error toasts are wired globally; a missing local `onError` is not a bug

`client/src/lib/providers.tsx`'s `QueryClient` registers `mutationCache: new MutationCache({ onError: (err) => notify.error(errorMessage(err)) })` — **every** `useMutation` failure anywhere in the app already surfaces a toast, unconditionally, regardless of whether that specific call site passes its own `onError`. TanStack Query runs cache-level and call-level callbacks together (neither suppresses the other), so `someMutation.mutate(vars, { onSuccess })` with no `onError` is not missing error handling — it's relying on the already-wired global one instead of duplicating it. This has been misdiagnosed as a bug three separate times in review passes on the skills feature (`AddSkillDrawer`/`CreateSkillModal`'s imports, `SkillsTab`'s optimistic mutations) before being caught.

**How to apply:** before flagging "mutation X has no `onError` / no error feedback," check `providers.tsx` for the global `MutationCache` handler first. A LOCAL `onError` is only needed when a mutation needs something the global toast doesn't do — reverting optimistic local state (see the `isPending`-guard insight above), closing/resetting a form only on success (already the pattern everywhere), or a more specific message than the raw API error.

**Evidence:** `client/src/lib/providers.tsx:41` (`mutationCache`), `client/src/app/skills/_components/SkillsView/AddSkillDrawer.tsx` / `CreateSkillModal.tsx` (import mutations with no local `onError` — correct as-is).

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
