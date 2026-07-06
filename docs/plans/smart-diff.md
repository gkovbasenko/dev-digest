# Development Plan — Smart Diff

Risk-based, deterministic re-layout of a PR's changed files so the reviewer's eye
lands on business logic first, not the lock file. **No new LLM call** — the expensive
call already happened in the Structured Reviewer; Smart Diff composes already-fetched
files + already-computed findings into the `SmartDiff` contract.

## Locked decisions / defaults

| Item | Choice |
|---|---|
| Findings source | Latest review only (`reviewsForPull(prId)[0]`), per brief. Each file carries `findings: {start_line, end_line, severity}[]`; badge `N` = `findings.length`. Caveat: latest-only can hide open findings from prior runs (`server/INSIGHTS.md` 2026-06-30) — accepted for v1. |
| `pseudocode_summary` | `null` — populating it needs an LLM, which the brief forbids at this step. Follow-up. |
| `split_suggestion` | Deterministic: `too_big = total_lines > 400`; `proposed_splits` grouped by top-level directory. Threshold in constants. |
| Classification | Pure fn of `path` (+ size for split). boilerplate = lockfiles/dist/build/out/.next/snapshots/*.min/*.map/vendor; wiring = *.config.*/tsconfig*/index barrels/server.ts/main.ts/package.json/.github; core = everything else. Patterns in a constants file. |
| Contract | `SmartDiffFile.findings` carries `{start_line, end_line, severity}` per finding (post-review change: was `finding_lines: number[]`). Single source of truth — badge count, jump target, and line color all read from the server-composed latest review, so the client no longer re-joins a separately-cached `usePrReviews`. Mirrored byte-for-byte server↔client. |
| Endpoint payload | Light — no `patch`. Client joins `patch` from `usePullDetail().files` by `path`; `finding_lines` drives badge + jump. |

## Contract (already in `vendor/shared/contracts/brief.ts:81-113`, mirrored)

```
SmartDiffRole = 'core' | 'wiring' | 'boilerplate'
SmartDiffFile = { path, pseudocode_summary?, additions, deletions, finding_lines: number[] }
SmartDiffGroup = { role, files: SmartDiffFile[] }
SmartDiff = { groups: SmartDiffGroup[], split_suggestion: { too_big, total_lines, proposed_splits: {name, files[]}[] } }
SmartDiffResponse = SmartDiff   // review-api.ts:63-65
```

## Flow

```
GET /pulls/:id/smart-diff
   getPrFiles(prId)  ─┐
   reviewsForPull[0] ─┼─▶ composeSmartDiff(files, latestFindings)
                      │      classifyFile(path) → role      (pure, constants)
                      │      finding_lines = startLines per file (latest review)
                      │      group by role; split_suggestion by dir + threshold
                      ▼
                   SmartDiff  ──▶ client useSmartDiff
Files-changed tab: [Smart order | Original order] toggle
   Smart  → SmartDiffViewer: Core / Wiring / Boilerplate(collapsed) groups,
            reuse FileCard/parsePatch per file (patch joined from usePullDetail by path),
            "N findings" badge (finding_lines.length), click badge → open + scrollIntoView(line),
            line severity color from usePrReviews findings (join file+line)
   Original → existing flat DiffViewer (unchanged)
```

---

## Lane S — server (one implementer) · skills: `server-architecture`, `fastify-best-practices`, `zod`

Mirror the Intent Layer trio (`reviews/routes.ts`, `service.ts`, `reviews/intent/`).

**S1 — constants** `server/src/modules/reviews/smart-diff/constants.ts`
- `SPLIT_TOO_BIG_LINES = 400`.
- Path pattern lists for boilerplate (lockfiles: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `*.lock`, `go.sum`; dirs: `dist/`, `build/`, `out/`, `.next/`, `vendor/`, `coverage/`; `__snapshots__/`, `*.snap`, `*.min.*`, `*.map`) and wiring (`*.config.*`, `tsconfig*.json`, `package.json`, `.github/`, `**/index.ts|js`, `server.ts`, `main.ts`, `*.env*`). Heavily commented (match `repo-intel/constants.ts` style).

**S2 — classifier** `server/src/modules/reviews/smart-diff/classify.ts`
- Pure `classifyFile(path: string): SmartDiffRole` — boilerplate check → wiring check → default core. No I/O. Follows `intent/hunk-headers.ts` purity precedent.

**S3 — composer** `server/src/modules/reviews/smart-diff/compose.ts`
- Pure `composeSmartDiff(files: PrFile[], findings: Finding[]): SmartDiff`:
  - per file: `role = classifyFile(path)`, `finding_lines = findings.filter(f=>f.file===path).map(f=>f.start_line)`, `pseudocode_summary = null`.
  - group into `SmartDiffGroup[]` in fixed order core → wiring → boilerplate (omit empty groups or keep? keep all three present-if-nonempty; order fixed).
  - `total_lines = Σ(additions+deletions)`; `too_big = total_lines > SPLIT_TOO_BIG_LINES`; `proposed_splits` = files grouped by top-level dir (first path segment), each `{name, files: path[]}` — empty array when not `too_big` or ≤1 dir.
- Validate output with the `SmartDiff` zod schema before returning.

**S4 — service + route**
- `server/src/modules/reviews/service.ts`: `getSmartDiff(workspaceId, prId): SmartDiffResponse` — workspace-scoped pull guard (mirror `getIntent`), `getPrFiles(prId)`, `reviewsForPull(prId)` → `[0]?.findings ?? []`, `composeSmartDiff(...)`.
- `server/src/modules/reviews/routes.ts`: `GET /pulls/:id/smart-diff` (mirror `GET /pulls/:id/intent` at :154-157; add to the doc header block). No POST/persistence — pure compute, no LLM, nothing to store.
- **No contract change, no DB change, no `index.ts`/`app.ts` change** (route lives in the already-registered `reviews` module).

**Tests** `server/test/smart-diff.test.ts`: `classifyFile` for representative paths (ratelimit.ts→core, config.ts→wiring, package-lock.json→boilerplate); `composeSmartDiff` — grouping, `finding_lines` from findings, `split_suggestion` threshold + dir grouping, empty-findings path.

**Verify (from `server/`, pnpm):** `pnpm typecheck` + `pnpm test` (hermetic; `.it.test.ts` need Docker — skip if unavailable, pre-existing).

---

## Lane C — client (one implementer) · skills: `ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`

**C1 — hook + type re-export**
- `client/src/lib/hooks/smart-diff.ts`: `useSmartDiff(prId)` — `useQuery`, key `["smart-diff", prId]`, `api.get<SmartDiffResponse>('/pulls/:id/smart-diff')`, `enabled: prId != null`. Mirror `hooks/intent.ts`. Re-export from `client/src/lib/hooks/index.ts`.
- `client/src/lib/types.ts:35`: add `SmartDiffResponse` to the `@devdigest/shared` re-export list.

**C2 — SmartDiffViewer** (new folder, mirror `IntentCard/` anatomy: component + `styles.ts` + `index.ts` + `.test.tsx`; place under `client/src/components/smart-diff/` or the pulls `_components/` — match `diff-viewer/`'s location choice)
- Renders `groups` in fixed order **Core logic / Wiring / Boilerplate**, each with a header (label + one-line description + file count), reusing `Badge`/`SectionLabel`.
- **Boilerplate group collapsed by default** (hand-rolled `useState(open)` + chevron, per `FileCard`/`ReviewRunAccordion` pattern — no vendored accordion exists).
- Per file: reuse `diff-viewer/FileCard` + `parsePatch` — join the file's `patch` from `usePullDetail(prId).files` by `path` (smart-diff payload has no patch). If no matching patch, render header-only.
- **"N findings" badge** on files where `finding_lines.length > 0`; clicking it opens the file card and `scrollIntoView` to the line (reuse the `ReviewRunAccordion` open+scroll pattern; add a `data-line` anchor in `CodeLine`).
- **Line severity color** overlay: from `usePrReviews(prId)` findings joined by `file` + line (`start_line`). Layout works with no reviews yet (badges/colors simply absent) — matches brief ("layout works before review, overlay doesn't").

**C3 — Smart/Original toggle** in `DiffTab.tsx` (or the `page.tsx` `{tab === "diff" && …}` block)
- A **Smart order | Original order** control using the `Tabs` primitive (`vendor/ui/kit/Tabs.tsx`). Smart → `SmartDiffViewer`; Original → existing flat `DiffViewer` (unchanged). Default to Smart.

**i18n:** new `smartDiff` namespace in `client/messages/en/*.json` (only `en` exists) — group headers/descriptions, "N findings", "Smart order"/"Original order", empty states.

**Tests** `SmartDiffViewer.test.tsx` (mock `useSmartDiff`/`usePullDetail`/`usePrReviews`): groups render in order; boilerplate collapsed by default; badge shows `finding_lines.length`; toggle switches Smart↔Original. Use `fireEvent` (no `user-event` in this repo, per `client/CLAUDE.md`).

**Verify (from `client/`, pnpm):** `pnpm typecheck` + `pnpm test`.

---

## Risks / edge cases
- **Empty `patch`** (GitHub omits patch for huge/binary files) → FileCard header-only; classifier still assigns a role by path.
- **No review yet** → `finding_lines` all empty, no badges/colors; grouping still works.
- **Latest-review-only** hides still-open findings from earlier runs (accepted v1; note in code near the `[0]` pick).
- **finding line outside rendered hunks** → badge count still correct; jump scrolls to nearest rendered line or no-ops gracefully.
- **Contract mirror** — no contract edit planned; if one becomes necessary, mirror `server`↔`client` `vendor/shared/contracts/*` byte-for-byte and re-check the two-copy registry rule (root `INSIGHTS.md`).
