# Implementation Plan: Project Context Folder

Spec: SPEC-2026-07-08-project-context-folder (approved, AC-1…AC-22)

## Decisions (locked — do not re-ask)

Product owner confirmed all three (coordinator, 2026-07-08). Recorded here so `run-plan`
executes without re-litigating them.

1. **AC-10 → Option A (keep T7).** reviewer-core gets one minimal, backward-compatible change:
   widen the `specs` param element from `string` to `{ source: string; text: string }` and wrap
   via `wrapUntrusted(spec.source, spec.text)`, so each document's clone-relative path flows to the
   untrusted wrapper's `source`. No existing caller passes `specs` (the server hard-codes it off
   today; the CI agent-runner never sets it), so it is additive in practice. The spec's Decisions
   section has been reconciled to match ("reviewer-core gets one minimal, backward-compatible change
   for AC-10 provenance (Option A)"), so plan and spec now agree. **T7 stays.**
2. **Execution mode → single-agent (one pass).** The feature is security-sensitive with
   cross-cutting invariants that must stay coherent (AC-11 dedup order; 50k/150k caps enforced on
   both client and server, AC-13/14; the AC-12 "missing" marker convention; the AC-10 change
   rippling through reviewer-core → contracts → run wiring) plus heavy shared-file contention
   (`container.ts`, the agents & skills modules, `run-executor.ts` + its repository, `api.ts`, the
   shared-contract barrel). One ordered pass keeps these consistent. The parallel-waves alternative
   is **dropped**.
3. **Context-attachment versioning in `agentVersions` → not in v1.** Paths are read fresh at run
   time; attachments are not snapshotted into agent versions.

## Execution mode

Single-agent (one pass) — locked (Decision 2).

## Goal & success criteria

"Done" = a reviewer-config author can browse a repo's `.md` docs under `specs/`/`docs/`/`insights/`
on a read-only Project Context page (with path + badge + `≈N tokens`), manually attach chosen
docs (ordered, paths-only) to an agent (Agent → Context tab) and/or a skill (Skill → Context
tab) under 50k-per-doc / 150k-aggregate caps enforced in UI **and** API, and on every run of that
agent the attached docs are read fresh from the target PR's clone (realpath-contained), deduped
(agent-first, then skill-inherited), injected once each into the existing untrusted
`## Project context` block, with the paths (and missing markers) in `RunTrace.specs_read` and the
exact injected text in `PromptAssembly.specs` — **adding zero LLM calls**. AC-1…AC-22 pass.

## Requirements review & recommendations

- **Verified against code:**
  - The `## Project context` slot, `wrapUntrusted`+`INJECTION_GUARD`, `PromptAssembly.specs`, and
    `RunTrace.specs_read` all exist; `run-executor.ts:340` hard-codes `specs_read: []` and never
    passes `specs`. `prompt_assembly` flows from `outcome.assembly`, so **AC-16's
    `prompt_assembly.specs` populates automatically** once T6 passes `specs` — no trace-contract
    change (confirms the spec's "no `trace.ts` churn").
  - The best-effort omit-when-empty enrichment pattern (callers/repoMap/skills) at
    `run-executor.ts:205-249` is exactly where `specs` plugs in; `getEnabledAgentSkills(agent.id)`
    at :222 is where skill-inherited docs get loaded. `repo.clonePath` is in scope at that point.
  - The realpath-containment reader is real: `resolveRealClonePath` (exported) + `readCloneFile`
    (private) in `conventions/service.ts:52,63`; negative-control tests in
    `conventions-helpers.test.ts`. This is the mandated reader (server INSIGHTS 2026-07-02).
  - `agentSkills` (agents.ts:51-62): PK `(agentId, skillId)`, `order int default 0`.
    `setAgentSkills` (agents/repository.ts:226-234) = delete-all-then-reinsert with `order: i` —
    the pattern to mirror. `getEnabledAgentSkills`/`recordRunSkills` live in
    `reviews/repository/skills.repo.ts`.
  - `container.tokenizer` **already exists** (container.ts:128-131) with a `Tokenizer.count()`
    port and `cl100k_base` impl — the "promote to container-level" work is essentially a
    doc-scope widen; just call it.
  - TraceBody already renders `specs_read` and `prompt_assembly.specs` (confirmed) — AC-17 is
    mostly verification.
- **Decided (recorded):**
  - **Schema shape:** use join tables `agentContextDocs` / `skillContextDocs` (spec's own
    recommendation; mirrors `agentSkills`; keeps ordering ergonomics) over a `jsonb string[]`.
  - **Stale scaffold — replace, don't build on it.** The pre-staged `SpecFile`/`IndexStatus`
    contracts (`platform.ts:274-288`) and `useContextFiles`/`useReindexContext` hooks
    (`lib/hooks/core.ts:122-137`) are embedding-flavored (`chunks_indexed`, `embedding`,
    `reindex`) and contradict this spec (no embeddings; read-only page, no reindex in v1). New
    spec-accurate contracts go in a fresh `contracts/context.ts`; the stale hooks are superseded
    (removed or left unused). The endpoint they call (`GET /repos/:id/context`) does not exist
    server-side yet — we build the real one.
  - **`context.json` i18n is stale** — its `empty` copy references `.devdigest/specs/`, a
    different root-folder model than the approved `specs,docs,insights` (env-config). Rewrite the
    namespace to match the spec.
  - **AC-12 missing markers / token volume in `specs_read`:** `trace.ts` stays `string[]`, so
    encode as a string convention (e.g. `specs/gone.md (missing)`, optional `≈N tokens`
    annotation). TraceBody renders strings as-is — no contract change.
- **Recommendations (HOW):**
  - **Promote the clone I/O to `modules/_shared/`** rather than cross-import conventions
    internals. Three consumers now need the contained reader (conventions, the new context module,
    and `run-executor` in the reviews module); importing `conventions/service.ts` from another
    module violates module isolation (server CLAUDE.md). Extract `resolveRealClonePath` +
    `readCloneFile` (+ the syntactic `resolveClonePath`/`isWithinRoot`) into
    `_shared/clone-read.ts`, re-point conventions. Aligns with the "promote to a shared free
    function when a third consumer needs it" server insight (2026-07-06 octokit note).
  - **Walker:** `walkClone` is hard-coded to `SUPPORTED_EXT` (no `.md`) and lives in repo-intel.
    Recommend promoting it (with its `EXCLUDED_DIRS`/`SUPPORTED_EXT` constants) to
    `_shared/clone-walk.ts` and adding an optional `extensions` param (default = today's set, so
    repo-intel behavior is unchanged), then re-pointing repo-intel's import. Discovery calls it
    with `{ extensions: new Set(['.md']) }` and applies the `specs/docs/insights` ancestor filter
    + badge derivation post-walk. This keeps a single bounded/symlink-skipping walker and honors
    the spec's "reuse walkClone" intent at the policy level. (Lower-risk alt if you'd rather not
    touch repo-intel: a small self-contained `.md` walker in `_shared` duplicating the
    symlink-skip + file-count-bound policy.)
  - **Caps as shared constants:** export `PER_DOC_TOKEN_CAP = 50000` and
    `AGGREGATE_TOKEN_CAP = 150000` from `contracts/context.ts` (mirrored) so UI and API enforce
    identical numbers.

## Affected modules & boundaries

- **reviewer-core/** — T7: widen `specs` element shape for AC-10 provenance. Public surface change
  (`src/index.ts` input type) but backward compatible.
- **shared contracts** (`server/src/vendor/shared/contracts/context.ts` + byte-for-byte client
  mirror + both `vendor/shared/index.ts` barrels) — new `context.ts`; **no** change to `trace.ts`.
- **server/** — new `modules/context/` (discovery + preview endpoints); new `_shared/clone-read.ts`
  + `_shared/clone-walk.ts` (promotions); `agents/` + `skills/` (repo + routes for attachments,
  caps); `reviews/` (`run-executor.ts` wiring + a `context.repo.ts`); `db/schema/{agents,skills}.ts`
  + generated migration; `container.ts` (tokenizer scope note); `app.ts` (register context module).
- **client/** — new `app/repos/[repoId]/context/` page + panel; `AgentEditor` Context tab;
  `SkillPreview` gains tabbed structure + Context tab; `lib/hooks/` (+ `api.ts` usage); NAV item;
  i18n `context.json`/`shell.json`; `vendor/ui/icons.tsx` (new icons); TraceBody test.
- **e2e/** — none required (AC-22 is a server integration test with a mock/recorded provider).

## Relevant engineering insights

- **Realpath containment needs BOTH a syntactic check AND a `realpath` symlink check** (server
  INSIGHTS 2026-07-02) — the read boundary for AC-2; both traversal and symlink negative controls
  must pass. Shapes T3/T4/T6.
- **Skills are already wired into runs** via `getEnabledAgentSkills → strip → reviewPullRequest({skills})`,
  recorded in `run_skills` (server INSIGHTS 2026-07-07) — T6 extends this same seam; only
  **enabled** skills contribute inherited docs (AC-9).
- **The `specs` slot IS `wrapUntrusted`-wrapped** (unlike `skills`, which is not — server INSIGHTS
  2026-07-01). Attached docs ride the *specs* slot, so they are injection-guard-covered with no
  new wrapping needed. Do **not** route them through the unwrapped `skills` slot.
- **`pnpm db:generate` blocks on an interactive rename prompt for mixed add+drop diffs** (server
  INSIGHTS 2026-07-02). T2 is purely additive (two new tables) → unambiguous, won't prompt. Keep
  it additive.
- **Reviewers run against the compose `devdigest` DB; a new table needs `pnpm db:migrate` there**
  (server INSIGHTS 2026-07-07) — relevant to the AC-22 live run (T13).
- **`ValidationError` → 422 mapping; a bare `Error` falls through to 500** (server INSIGHTS
  2026-07-01) — caps rejection in T5 must throw `ValidationError`.
- **Fastify literal routes before `:id`** (server INSIGHTS 2026-07-01) — order context routes.
- **SkillsTab optimistic conventions** (client INSIGHTS 2026-07-01, multiple): `isPending` guard on
  **every** gesture (click AND drag), derive `linkedIds`/counts from the **same** optimistic local
  state, and in tests mock query hooks with a **stable module-scoped** reference (a fresh `[]`
  literal OOM-crashes the worker). Shape T10/T11.
- **`s.tabBody` vs `s.body`** for tabs that own their layout; **`icons.tsx` is an allowlist** (add
  new Lucide icons first); **global `MutationCache` toast** means no local `onError` needed except
  optimistic rollback (client INSIGHTS 2026-07-01). Shape T9/T10/T11.
- **`Badge` is `white-space: nowrap`** — fine for the short specs/docs/insights badges; do not use
  it for full paths in a constrained grid column (client INSIGHTS 2026-07-07).
- **`Markdown` primitive is XSS-safe** (`rehypeSanitize` + `safeHref`) — correct for the read-only
  doc preview of untrusted repo markdown (client INSIGHTS 2026-07-02).

## Architecture & approach

Discovery and run-time reading share one bounded, realpath-contained clone I/O layer in
`_shared`. Attachments persist **paths only** in two `agentSkills`-shaped join tables. Caps are
computed with the existing `container.tokenizer` and enforced identically in UI and API via shared
constants. At run time, `run-executor` collects agent-level then enabled-skill-level paths, dedups
(first occurrence wins), reads each fresh from the target clone (skipping missing with a Live Log
warning), and passes them to the already-wrapped `## Project context` slot — omit-when-empty, so a
run with no attachments is byte-identical to today and makes the same number of provider calls.

## Tasks

### T1 — Shared contracts: `contracts/context.ts` (+ byte-for-byte mirror + barrels)
- **Module:** shared
- **Traces to:** AC-6 (and underpins AC-1/4/5/7/13/14)
- **Files to create/modify:** create `server/src/vendor/shared/contracts/context.ts`; create identical
  `client/src/vendor/shared/contracts/context.ts`; wire the new file into `server/src/vendor/shared/index.ts`
  and `client/src/vendor/shared/index.ts` (both barrels).
- **Objective:** define `ContextBadge = z.enum(['specs','docs','insights'])`;
  `ContextDocument { path, badge, token_count }`; `ContextDocList { indexed: boolean, documents: ContextDocument[] }`;
  `ContextDocPreview { content: string }`; `SetContextInput { paths: string[] }`;
  and exported `PER_DOC_TOKEN_CAP = 50000`, `AGGREGATE_TOKEN_CAP = 150000`.
- **Out of scope:** editing `trace.ts` (unchanged); touching the stale `SpecFile`/`IndexStatus` in
  `platform.ts`; `FEATURE_MODELS`.
- **Skills to apply:** `zod`, `typescript-expert`
- **Insights/gotchas:** the server↔client mirror is NOT enforced by `tsc`; the two `context.ts`
  must be byte-for-byte identical. (Ignore the pre-existing drift in *other* mirrored files — out
  of scope.)
- **Depends on:** none
- **Verify:** `cd server && pnpm typecheck`; `cd client && pnpm typecheck`;
  `diff server/src/vendor/shared/contracts/context.ts client/src/vendor/shared/contracts/context.ts` exits 0.

### T2 — DB schema + generated migration for attachments
- **Module:** server
- **Traces to:** AC-4, AC-5
- **Files to create/modify:** `server/src/db/schema/agents.ts` (add `agentContextDocs`),
  `server/src/db/schema/skills.ts` (add `skillContextDocs`); ensure both are exported via
  `server/src/db/schema.ts`; run `pnpm db:generate` (creates a new `src/db/migrations/00XX_*.sql`).
- **Objective:** `agentContextDocs` = `{ agentId uuid FK agents cascade, path text, order int notNull default 0 }`,
  PK `(agentId, path)`. `skillContextDocs` = same with `skillId → skills`. Mirror `agentSkills`.
- **Out of scope:** hand-editing any file under `src/db/migrations/` (generated only); adding a run-side
  table (run visibility uses the existing `specs_read` trace field, not a join).
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Insights/gotchas:** purely additive (two new tables) → `db:generate` is unambiguous and won't hit
  the interactive rename prompt. Do not also drop/rename anything in the same generate run.
- **Depends on:** none
- **Verify:** `cd server && pnpm typecheck`; confirm exactly one new additive migration file appears.

### T3 — Promote clone I/O to `_shared` (contained reader + bounded walker)
- **Module:** server
- **Traces to:** AC-2 (and enables T4/T6)
- **Files to create/modify:** create `server/src/modules/_shared/clone-read.ts` (move
  `resolveRealClonePath` + `readCloneFile` from `conventions/service.ts` and the syntactic
  `resolveClonePath`/`isWithinRoot` from `conventions/helpers.ts`, re-export both); create
  `server/src/modules/_shared/clone-walk.ts` (move `walkClone` + its constants from
  `repo-intel/pipeline/walk.ts`, add optional `extensions?: ReadonlySet<string>` defaulting to
  `SUPPORTED_EXT`); re-point imports in `conventions/service.ts`, `conventions/helpers.ts`, and
  `repo-intel/pipeline/*` to `_shared`.
- **Objective:** one boundary-clean, symlink-skipping, file-count-bounded clone read+walk usable by
  any module without cross-importing another module's internals; conventions & repo-intel behavior
  byte-identical.
- **Out of scope:** changing containment/walk *behavior* or default extension set; touching
  `simple-git.ts`'s raw `readFile` (must NOT be used for this feature).
- **Skills to apply:** `typescript-expert`, `architecture-patterns`, `security`
- **Insights/gotchas:** realpath-containment requires syntactic AND symlink checks — keep both;
  the existing traversal + symlink negative-control tests must still pass after the move.
- **Depends on:** none
- **Verify:** `cd server && pnpm typecheck && pnpm test` (conventions-helpers + repo-intel walk tests green).

### T4 — Context discovery module (server)
- **Module:** server
- **Traces to:** AC-1, AC-2, AC-3, AC-7, AC-19
- **Files to create/modify:** create `server/src/modules/context/{routes.ts,service.ts}` (+ tests);
  register the plugin in `server/src/app.ts`; a one-line doc-scope widen in
  `server/src/adapters/tokenizer/index.ts` (drop "ONLY under modules/repo-intel").
- **Objective:** `GET /repos/:id/context` → `ContextDocList`: walk the clone via `_shared/clone-walk`
  with `{extensions:['.md']}`, keep only paths whose nearest enclosing folder ∈ configured root set
  (env `PROJECT_CONTEXT_ROOTS`, default `specs,docs,insights`), derive `badge` from that folder, and
  `token_count` via `container.tokenizer.count(body)`. If `repo.clonePath` is null → `{ indexed:false,
  documents:[] }`, never 500. Add `GET /repos/:id/context/file?path=…` → `ContextDocPreview` reading
  through the `_shared` realpath-contained reader (returns 404/empty on escape or miss).
- **Out of scope:** any write/create/upload/reindex endpoint; embeddings; attachment persistence (T5).
- **Skills to apply:** `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `typescript-expert`,
  `security`, `architecture-patterns`
- **Insights/gotchas:** register literal routes before any `:id` collisions; derive `workspaceId`
  from `getContext()` only; the preview read re-validates containment server-side (client list is not
  trusted).
- **Depends on:** T1, T3
- **Verify:** `cd server && pnpm typecheck`; new `context.it.test.ts` against a fixture clone with
  `specs/a.md`,`docs/b.md`,`deep/nested/insights/c.md`,`src/x.md`,`specs/notes.txt` → exactly a.md(specs),
  b.md(docs),c.md(insights); `src/x.md` & `.txt` absent; null-clone → `indexed:false`; traversal +
  symlink paths unreadable.

### T5 — Attachment persistence + caps (server: agents + skills)
- **Module:** server
- **Traces to:** AC-4, AC-5, AC-13, AC-14, AC-6
- **Files to create/modify:** `agents/repository.ts` (add `setAgentContextDocs`, `getAgentContextDocs`
  mirroring `setAgentSkills`/`getAgentSkills`); `skills/repository.ts` (same for skill side);
  `agents/routes.ts` + `agents/service.ts` and `skills/routes.ts` + `skills/service.ts` (add
  `GET/POST /agents/:id/context` and `GET/POST /skills/:id/context`, body `SetContextInput`).
- **Objective:** persist an **ordered path list** (delete-all + reinsert `order:i`), paths only, never
  text. On `POST`, the service reads+counts each submitted path via the `_shared` reader +
  `container.tokenizer`, rejects (`ValidationError`/422, persist nothing) if any doc > `PER_DOC_TOKEN_CAP`
  or the set sum > `AGGREGATE_TOKEN_CAP`, and rejects paths that fail realpath containment.
- **Out of scope:** run-time reading/injection (T6); auto-pruning missing paths.
- **Skills to apply:** `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`,
  `zod`, `typescript-expert`, `security`, `architecture-patterns`
- **Insights/gotchas:** throw `ValidationError` (not bare `Error`) so it maps to 422; literal-before-`:id`
  route order; `workspaceId` from `getContext()` only.
- **Depends on:** T1, T2, T3
- **Verify:** `cd server && pnpm typecheck`; `*.it.test.ts`: after `POST …/context {paths:[a,b]}` the join
  rows are exactly those two paths in order, no body; an over-per-doc-cap or over-aggregate-cap POST → 4xx,
  nothing persisted.

### T6 — Run-executor wiring: read → dedup → inject → trace (server: reviews)
- **Module:** server
- **Traces to:** AC-5, AC-9, AC-11, AC-12, AC-15, AC-16
- **Files to create/modify:** create `reviews/repository/context.repo.ts` (`getAgentContextDocs`,
  `getSkillContextDocs` — batched by skill ids) and surface via the reviews repository; modify
  `reviews/run-executor.ts` `runOneAgent` (after `getEnabledAgentSkills` at ~:222, and the trace build
  at ~:315-346).
- **Objective:** collect agent-level paths (their order) then enabled-skill-inherited paths (skill order
  from `loadedSkills`, then per-skill doc order); **dedup by path, first occurrence wins**; read each fresh
  from `repo.clonePath` via the `_shared` contained reader; **skip** missing/unreadable (Live Log warning
  naming the path + mark missing in `specs_read`); build the specs input (`{ source: path, text }` per T7)
  and pass `...(specs.length ? { specs } : {})` to `reviewPullRequest`; replace `specs_read: []` (:340) with
  the ordered paths + missing markers. Emit Live Log lines: attached count, per-path read/skip, total
  injected token estimate (mirroring the callers/repo-map lines). `prompt_assembly.specs` populates
  automatically from `outcome.assembly`.
- **Out of scope:** any new provider call; changing skill loading semantics; `trace.ts` contract.
- **Skills to apply:** `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `typescript-expert`,
  `security`, `architecture-patterns`, `engineering-insights`
- **Insights/gotchas:** docs go into the **specs** slot (already `wrapUntrusted`-wrapped) — never the
  unwrapped `skills` slot; only **enabled** skills contribute (AC-9); best-effort like callers/repoMap
  (never fail the run).
- **Depends on:** T3, T5, T7 (T7 supplies the `{ source, text }` specs shape it passes)
- **Verify:** `cd server && pnpm typecheck`; run-executor `.it.test.ts` with `MockLLMProvider`: assembled
  user message contains `## Project context` with the doc text inside `<untrusted …>`; agent `[a,b]` +
  skill `[b,c]` → injected `a,b,c` (b once); absent `specs/gone.md` → status `done`, warning logged, only
  present doc injected, `specs_read` marks it missing; `MockLLMProvider.calls` equal with vs without
  attachments.

### T7 — reviewer-core specs provenance (AC-10)
- **Module:** reviewer-core
- **Traces to:** AC-10
- **Files to create/modify:** `reviewer-core/src/prompt.ts` (widen `specs` element to
  `{ source: string; text: string }`; wrap `wrapUntrusted(spec.source, spec.text)`); the input type in
  `reviewer-core/src/index.ts`/review input; existing spec-wrapping tests.
- **Objective:** the untrusted wrapper for each injected doc carries its clone-relative path as `source`.
- **Out of scope:** any other reviewer-core surface; JS emit; touching the grounding gate.
- **Skills to apply:** `typescript-expert`, `zod`, `architecture-patterns`, `engineering-insights`
- **Insights/gotchas:** consumed as `.ts` source by server + CI agent-runner — additive/optional, no
  existing caller passes `specs`; still, search both call sites before finalizing. Decision 1 (Option A)
  is locked — this task is confirmed, not contingent.
- **Depends on:** none (gates T6's AC-10 assertion)
- **Verify:** `cd reviewer-core && npm run typecheck && npm test` (assembled-prompt test asserts the
  wrapper for `specs/a.md` has `source = specs/a.md`).

### T8 — Client data access: hooks for docs + attachments
- **Module:** client
- **Traces to:** AC-4, AC-5, AC-7
- **Files to create/modify:** `client/src/lib/hooks/context.ts` (new) — `useContextDocs(repoId)`
  (`GET /repos/:id/context`), `useContextFilePreview`, `useAgentContext`/`useSetAgentContext`,
  `useSkillContext`/`useSetSkillContext` (via `api.get/post`); remove/supersede the stale
  `useContextFiles`/`useReindexContext` in `lib/hooks/core.ts` (and the `SpecFile`/`IndexStatus` uses in
  `lib/types.ts`).
- **Objective:** typed query/mutation pairs matching the `useAgentSkills`/`useSetAgentSkills` shape
  (mutation writes the server response into cache via `setQueryData`).
- **Out of scope:** UI components (T9-T11); ad-hoc `fetch` outside `api.ts`.
- **Skills to apply:** `next-best-practices`, `react-best-practices`, `zod`, `typescript-expert`,
  `security`, `engineering-insights`
- **Insights/gotchas:** all server access through `api.ts` + a hook; global `MutationCache` already
  toasts errors.
- **Depends on:** T1 (contracts mirrored)
- **Verify:** `cd client && pnpm typecheck`.

### T9 — Project Context page + nav + command palette
- **Module:** client
- **Traces to:** AC-3, AC-18, AC-19
- **Files to create/modify:** `client/src/app/repos/[repoId]/context/page.tsx` +
  `_components/ProjectContextPanel/`; add `{ key:'context', label:'Project Context', icon:…,
  href:'/repos/:repoId/context' }` to the WORKSPACE group in `client/src/vendor/ui/nav.ts` (command
  palette auto-registers via `useShellCommands`); add any new icon to `vendor/ui/icons.tsx`; align
  `client/messages/en/context.json` (and every other locale) to the `specs,docs,insights` model;
  `nav.context`/`shell.json` already present.
- **Objective:** list discovered docs (path + badge + `≈N tokens`), read-only `Markdown` preview on row
  click (no create/upload/edit/delete), an indexed-status footer, and a not-indexed empty state (never an
  error). Reuse the per-repo page shell pattern (`useParams`, `useActiveRepo`, `AppShell`, `RepoNotFound`).
- **Out of scope:** any write affordance; a reindex button.
- **Skills to apply:** `next-best-practices`, `react-best-practices`, `react-testing-library`, `zod`,
  `typescript-expert`, `security`, `engineering-insights`
- **Insights/gotchas:** `icons.tsx` is an allowlist (add before use); translation keys must mirror across
  all locale files; `Badge` for the short badge only, not the path; `Markdown` is XSS-safe for untrusted
  repo text.
- **Depends on:** T8
- **Verify:** `cd client && pnpm typecheck`; component test: rows show path+badge, click → read-only preview,
  no create/upload/edit/delete controls, not-indexed → empty state; shell test: WORKSPACE "Project Context"
  item + palette "Go to Project Context".

### T10 — Agent editor "Context" tab
- **Module:** client
- **Traces to:** AC-7, AC-8, AC-13, AC-14, AC-20
- **Files to create/modify:** add `context` to `AgentEditor/constants.ts` `TABS` and the conditional render
  in `AgentEditor.tsx` (use `s.tabBody`); new
  `AgentEditor/_components/ContextTab/ContextTab.tsx` (+ test), mirroring `SkillsTab`.
- **Objective:** list attachable docs with drag handle, checkbox, name, specs/docs/insights badge,
  "Filter documents…", per-doc Preview, header "Project context — N of M attached"; toggle attaches/detaches,
  drag (+ keyboard up/down fallback) reorders, persisting an ordered path list via `useSetAgentContext`.
  Show per-doc `≈N tokens`; footer aggregate `≈N tokens · Injected as an untrusted block (## Project
  context) into every run`. Block the attach control for any doc > 50k (cap warning, no mutation); block
  save when the aggregate would exceed 150k (cap warning).
- **Out of scope:** the discovery/preview endpoints (server); skill-side tab (T11).
- **Skills to apply:** `next-best-practices`, `react-best-practices`, `react-testing-library`, `zod`,
  `typescript-expert`, `security`, `engineering-insights`
- **Insights/gotchas:** guard **every** mutation gesture (toggle AND drag start/over/end) on `isPending`;
  derive `linkedIds`/counts from the optimistic local order, not server truth; in tests mock the query hook
  with a **stable module-scoped** reference (fresh `[]` OOM-crashes the worker); `s.tabBody` for this tab;
  native HTML5 DnD (no vendor drag primitive); local `onError` only for optimistic rollback.
- **Depends on:** T8
- **Verify:** `cd client && pnpm typecheck`; component tests: toggle → `useSetAgentContext` called with the
  expected ordered `paths`; header N-of-M; drag reorders; a 100+217 pair → footer `≈ 317 tokens · …`; a
  >50k doc → blocked control, no mutation; over-aggregate → blocked save.

### T11 — Skill editor "Context" tab (introduces tabs into SkillPreview)
- **Module:** client
- **Traces to:** AC-5, AC-21
- **Files to create/modify:** `client/src/app/skills/_components/SkillsView/SkillPreview.tsx` (introduce a
  `Tabs` structure — none exists today) + a new Context tab component (+ test).
- **Objective:** a "Context" tab with a "Project context to use" section explaining inheritance and a
  "SERIALIZES AS" preview listing attached paths (e.g. `## Project specifications` / `- specs/public-api.md`),
  attach controls with the same 50k/150k caps, persisting via `useSetSkillContext`.
- **Out of scope:** agent-side tab (T10); changing skill save/version semantics.
- **Skills to apply:** `next-best-practices`, `react-best-practices`, `react-testing-library`, `zod`,
  `typescript-expert`, `security`, `engineering-insights`
- **Insights/gotchas:** SkillPreview is `key`-remounted per skill — if tabs hold unsaved state, use the
  existing dirty-ref+callback pattern (client INSIGHTS 2026-07-02). Same optimistic/isPending conventions
  as T10. **Higher effort than T10** because tabs are new to this editor.
- **Depends on:** T8
- **Verify:** `cd client && pnpm typecheck`; component test: attaching `specs/public-api.md` renders the
  serialization preview containing `- specs/public-api.md`.

### T12 — Run-trace rendering (verify + extend)
- **Module:** client
- **Traces to:** AC-16, AC-17
- **Files to create/modify:** `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` (+ test) — likely
  no logic change (it already renders `specs_read` and the expandable `prompt_assembly.specs` block);
  ensure the AC-12 "missing" markers and any `≈N tokens` annotation render as plain strings.
- **Objective:** confirm/extend that a completed run's trace shows attached paths under "Specs read" and an
  expandable project-context (untrusted) block with the exact injected text.
- **Out of scope:** `trace.ts` contract changes.
- **Skills to apply:** `next-best-practices`, `react-best-practices`, `react-testing-library`,
  `typescript-expert`, `engineering-insights`
- **Depends on:** T6 (produces the trace data shape)
- **Verify:** `cd client && pnpm typecheck`; TraceBody component test with populated `specs_read` +
  `prompt_assembly.specs` → paths listed, block expands to the injected text.

### T13 — End-to-end acceptance (AC-22)
- **Module:** server
- **Traces to:** AC-22
- **Files to create/modify:** a `reviews`/run-executor `.it.test.ts` (mock or recorded provider).
- **Objective:** attach an invariant doc ("module `api/` must not import `db/` directly") to an agent, run
  it against a diff adding `import … from 'db'` in `api/`, assert a finding is emitted whose rationale cites
  the attached doc — grounding gate still applies (finding must intersect a real diff hunk).
- **Out of scope:** new product code (assembles T4-T6 behavior only).
- **Skills to apply:** `fastify-best-practices`, `typescript-expert`, `engineering-insights`
- **Insights/gotchas:** for a *live* run (not the it-test) the compose `devdigest` DB needs
  `cd server && pnpm db:migrate` first (server INSIGHTS 2026-07-07).
- **Depends on:** T6
- **Verify:** `cd server && pnpm test` (the new `.it.test.ts` passes).

## Execution map

Single-agent, one ordered pass:
T1 → T2 → T3 → T7 → T4 → T5 → T6 → T8 → T9 → T10 → T11 → T12 → T13.
Hard dependencies: T4⟵{T1,T3}; T5⟵{T1,T2,T3}; T6⟵{T3,T5,T7}; T8⟵T1; T9/T10/T11⟵T8; T12⟵T6; T13⟵T6.
(T7 is placed before T4 so the `{ source, text }` specs shape exists before T6 consumes it; it could
equally land any time before T6.)

## Shared-contract changes

- **New:** `contracts/context.ts` (T1) — `ContextBadge`, `ContextDocument`, `ContextDocList`,
  `ContextDocPreview`, `SetContextInput`, `PER_DOC_TOKEN_CAP`, `AGGREGATE_TOKEN_CAP` — added
  **byte-for-byte to both** `server/` and `client/` `vendor/shared/contracts/`, plus both
  `vendor/shared/index.ts` barrels. Verified by `diff … exits 0` (AC-6).
- **Unchanged (no mirror churn):** `trace.ts` — `PromptAssembly.specs` and `RunTrace.specs_read` already
  exist and are populated by wiring alone.
- **Not a vendor/shared contract:** T7's reviewer-core `specs` input type lives in reviewer-core, not
  `vendor/shared` — no mirror required.
- **Pre-existing drift (out of scope):** the server↔client mirror already diverges on unrelated files
  (per research). Do **not** fix that here — only the files this feature touches must match.

## End-to-end verification

Full-stack proof = **AC-22** (T13): an attached invariant doc causes a grounded finding citing the doc, on
a run that makes the same number of provider calls as an unattached run (AC-15). Plus the trace shows the
paths in "Specs read" and the exact injected text in the expandable project-context block (T12/AC-16/17),
and the round-trip is visible: attach on the Agent Context tab (T10) → run → trace. Command-level gate:
`cd server && pnpm typecheck && pnpm test`; `cd client && pnpm typecheck && pnpm test`;
`cd reviewer-core && npm run typecheck && npm test`.

## Risks / open questions

1. **Path in a join PK.** `(agentId, path)` as PK is fine for short clone-relative paths (well under the
   btree row-size limit), but a pathological long path would be rejected at insert — acceptable given
   discovery-sourced paths; the API also validates containment. No action unless an explicit length cap is
   wanted.
2. **`walkClone` promotion touches repo-intel imports** (T3). Behavior is preserved (default extension set
   unchanged) and covered by repo-intel's own tests, but it is the one place this plan reaches into an
   otherwise-untouched module. The lower-risk alternative (a separate `_shared` `.md` walker) is noted in
   Recommendations.

_All three product decisions (AC-10 Option A / single-agent / no v1 versioning) are locked above and are
not open._
