# Client Insights

Non-obvious discoveries from real sessions. Specific and actionable — pass the cold-read test.
See also: `insights/gotchas.md` for known quirks at project start.

---

## What Works

2026-06-17 — Shared display components for PR list cells live in `client/src/components/`. Pure display, no fetching. Accept `value | null | undefined`, render `–` for absent data. Pattern: `({ cost }: { cost?: number | null }) => cost && cost > 0 ? "$X.XXX" : "–"`. ref: client/src/components/RunCostBadge/RunCostBadge.tsx:1

2026-06-17 — Lazy-enable TanStack Query by passing `undefined` instead of a boolean flag: `usePrReviews(anchorRect && totalFindings > 0 ? pr.id : undefined)`. When `prId` is `undefined`, `enabled: !!prId` is false — no fetch fires. Query enables automatically when the condition becomes truthy. No conditional hook call needed. ref: client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:28

2026-06-17 — Store `DOMRect | null` as hover state instead of `boolean` for popovers — gives both the trigger signal AND the position for `position: fixed` placement in one state value. Pattern: `onMouseEnter={(e) => setAnchorRect(e.currentTarget.getBoundingClientRect())}`. ref: client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:34

2026-06-17 — `createPortal(content, document.body)` escapes `overflow: hidden` containers. Use for any overlay/popover rendered inside a clipped container. ref: client/src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx:96

## What Doesn't Work

2026-06-17 — `Icon.AlertCircle` does not exist in `@devdigest/ui` — runtime error "Element type is invalid: expected a string... but got undefined". Never guess icon names; check existing usages (`grep -oh "Icon\.[A-Za-z]*"`) to find what's available. ref: client/src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx:56

## Codebase Patterns

2026-06-17 — `tableCard` in `styles.ts` has `overflow: hidden` — any `position: absolute` child inside the PR list table is clipped. Popovers/tooltips inside the table must use `position: fixed` + `getBoundingClientRect()` for correct placement. ref: client/src/app/repos/[repoId]/pulls/styles.ts:103

2026-06-17 — `@devdigest/shared` in the client resolves to `./src/vendor/shared/` (client's OWN local copy), NOT to `../server/src/vendor/shared/`. `client/tsconfig.json` has `"@devdigest/shared": ["./src/vendor/shared/index.ts"]`. The `gotchas.md` says "resolves to ../server/src/vendor/shared" — that is wrong. When adding fields to any shared contract (e.g. `PrMeta`), BOTH `server/src/vendor/shared/contracts/platform.ts` AND `client/src/vendor/shared/contracts/platform.ts` must be updated independently. ref: client/tsconfig.json:1

2026-06-17 — PR list column layout is controlled by two constants that MUST change in sync: `GRID` (CSS `grid-template-columns` string) and `COLUMN_KEYS` (string array of column identifiers) in `constants.ts`. Missing one causes misaligned headers/rows with no TypeScript error. ref: client/src/app/repos/[repoId]/pulls/constants.ts:1

## Tool & Library Notes

## Recurring Errors & Fixes

2026-06-17 — `git add` on paths with square brackets (Next.js dynamic routes like `[repoId]`, `[number]`) fails in zsh with "no matches found: client/src/app/repos/[repoId]/..." — zsh glob-expands brackets before git sees them. Fix: always quote such paths: `git add "client/src/app/repos/[repoId]/pulls/..."`. ref: client/src/app/repos/[repoId]/pulls/constants.ts:1

## Session Notes

2026-06-17 — Run Cost Badge: added COST column to PR list → surfaced `@devdigest/shared` dual-copy trap (client has its own vendor copy, gotchas.md was wrong). Fixed by updating client's local platform.ts. Files: client/src/vendor/shared/contracts/platform.ts, client/src/app/repos/[repoId]/pulls/constants.ts, client/src/components/RunCostBadge/RunCostBadge.tsx.

2026-06-17 — Severity filter pills + findings hover popover: added severity pills to FindingsPanel (PR detail) and lazy-fetch popover to PR list rows. Zero server changes — all data already existed (`findings_critical/warning/suggestion` counts in PrMeta, full findings via `usePrReviews`). Files: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx, client/src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx, client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx.

## Open Questions
