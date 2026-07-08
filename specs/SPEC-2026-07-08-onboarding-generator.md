# Spec: Onboarding Generator  |  Spec ID: SPEC-2026-07-08-onboarding-generator  |  Status: approved

Module: cross-cutting (server · client · shared; reviewer-core unchanged)

## Problem & why

A new engineer dropped into an unfamiliar repository spends their first days reconstructing what the service is, how a request flows, which files matter, how to run it locally, and what to read first. DevDigest already indexes every repo (`repo-intel`: file rank, import graph/`file_edges`, symbols, endpoints), so the raw material for a guided tour already exists on disk and in Postgres. This feature turns that index into a single **Onboarding Tour** page — five sections that orient a newcomer fast: an architecture overview + diagram, ranked critical paths, how to run locally, a guided reading path, and suggested first tasks.

The plumbing is already half-built: the `onboarding` table (`server/src/db/schema/context.ts` — `repoId` PK, `json` jsonb, `generatedAt`), the `Onboarding` / `OnboardingSection` / `OnboardingLink` Zod contracts (`server/src/vendor/shared/contracts/knowledge.ts`, already mirrored to client), the `onboarding.system.md` system prompt, the `onboarding` entry in `FEATURE_MODELS` (default `openrouter` / `deepseek/deepseek-v4-flash`), and the rank-driven facade methods `getTopFilesByRank` / `getCriticalPaths` (`RepoIntel`) all exist. What is missing and what this feature adds: an **onboarding module** (service + routes) that assembles the prompt, makes the single structured LLM call, grounds and persists the result; the **read/regenerate API**; and the **client Onboarding Tour page + nav item**. The closest existing analog to follow is the `conventions` module (per-repo, paid LLM generation over the clone, `resolveFeatureModel`, clone-read containment).

## Goals / Non-goals

**Goals**
- A repo-scoped **Onboarding Tour page** at `/repos/:repoId/onboarding` rendering the five sections in a fixed order: `architecture`, `critical_paths`, `how_to_run`, `guided_reading`, `first_tasks`.
- A **Generate / Regenerate** action (paid LLM call) that produces all five sections in one structured call, grounded strictly on the repo index + a bounded set of key-file excerpts, and persists the result (one cached row per repo).
- A **Read** endpoint the page loads from (cached result + generation metadata: source file count, generated-at, generation SHA, stale flag, indexed status).
- Deterministic, safe **grounding**: repo content is untrusted data; every emitted file path is verified against the real index before it can become an "Open" link.
- Explicit, well-defined **page states**: not-indexed, never-generated, generating, generated, stale, failed.
- A **"Onboarding Tour"** navigation item under WORKSPACE.

**Non-goals**
- **Public / unauthenticated sharing.** A tokenized public link that renders the tour without login is out of scope for v1 (no public-link infra and no multi-user auth exist today). See the Share-link `[NEEDS CLARIFICATION]`.
- **In-app file viewer.** "Open" links out to GitHub; DevDigest does not gain a file-viewing surface.
- **Auto-generation on navigation.** Visiting the page never fires a paid LLM call on its own; generation is always user-initiated (see Decisions).
- **Editing the generated tour** in the UI (no manual edits to sections/prose/diagram in v1).
- **Per-section independent regeneration.** Regenerate always rebuilds all five sections in one call.
- **Changing the `onboarding` DB table's primary shape** (one row per repo) — regeneration upserts, it does not version history.
- **Any change to `FEATURE_MODELS`** — the `onboarding` entry already exists; the three-copy registry is untouched.
- **Cost persistence** — the `onboarding` table has no cost column and none is added; cost is not surfaced in v1.
- **`reviewer-core` public-surface change** — generation uses the server LLM adapter + structured-output helper directly (like `conventions`), not the review pipeline.

## Assumptions & dependencies

- Depends on the repo being **indexed**: a clone on disk (`repos.clonePath`) and a usable `repo_index_state` with ranked files. Generation is gated on this (like `conventions.extract`, which throws when the repo isn't cloned / has no indexed source files).
- Reuses `RepoIntel.getTopFilesByRank` / `getCriticalPaths` / `getConventionSamples` for the ranked file set and dependency chains, and `RepoIntel.getIndexState` for `filesIndexed` / `lastIndexedSha` / indexed status.
- Reuses the `conventions` clone-reader containment pattern (`resolveRealClonePath` = resolve → `realpath` → within-root; `readCloneFile`) for reading key-file excerpts — **not** the raw `GitClient.readFile` (no containment guard).
- Reuses `resolveFeatureModel(container, workspaceId, 'onboarding')` for provider/model selection and `container.llm(provider).completeStructured(...)` for the single structured call, validated against the `Onboarding` contract.
- Reuses the existing `onboarding.system.md` prompt and `platform/prompts.ts` template reader; the `{{sections}}` placeholder is set to this feature's five section kinds (see Decisions — the current prompt's `routes_and_apis` mention is superseded).
- Reuses the client `github-urls.ts` blob-URL helper for "Open" links, `@devdigest/ui` primitives (`Markdown`, `MonoLink`, `Card`, `EmptyState`, `ErrorState`, `Button`, `Icon`), the client `mermaid` renderer, and TanStack Query hooks via `lib/api.ts`.
- No multi-user auth today (`LocalNoAuthProvider`); workspace scoping comes from `getContext()` as everywhere else.
- The existing `/onboarding` **client route is the Add-Repository screen** (naming collision) — the tour lives at the repo-scoped `/repos/:repoId/onboarding`; the shell active-nav matcher must distinguish them (see AC-12).

## User stories

- As a newcomer to a repo, I want a one-page guided tour generated from the index — what the service is, how requests flow, the files that matter, how to run it, what to read first, and starter tasks — so that I get oriented in minutes instead of days.
- As a newcomer, I want to click a critical-path or reading-path file and open it on GitHub, so that I can jump straight into the code the tour points me at.
- As a repo maintainer, I want to regenerate the tour after the codebase has moved, and to see when it was last generated and whether it's now stale, so that the tour stays trustworthy.
- As a cost-conscious user, I want generation to be explicit (never fired just by opening the page) and to see that it uses the configured onboarding model, so that I control when a paid call happens.

## Acceptance criteria (EARS)

### Generation & persistence (server)

- **AC-1** — WHEN `POST /repos/:id/onboarding/regenerate` is requested for an **indexed** repo, the system shall assemble the prompt from the repo index (ranked files, critical paths) plus a bounded set of key-file excerpts read through the containment-checked clone reader, make **exactly one** `completeStructured` call using the model from `resolveFeatureModel(workspaceId, 'onboarding')`, validate the result against the `Onboarding` contract, upsert it into the `onboarding` table keyed by `repoId`, and return the generated `OnboardingDoc`.
  - Verify: server integration test with a `MockLLMProvider` returning a valid `Onboarding` payload → response is the persisted doc; `MockLLMProvider.calls.length === 1`; the `onboarding` row for the repo now holds the returned JSON.
- **AC-2** — IF the repo has no clone on disk or no indexed/ranked source files, THEN `regenerate` shall return a `422` validation error (message naming "not indexed / run resync first"), shall **not** call the LLM, and shall not write the `onboarding` table.
  - Verify: integration test against a repo with `clonePath = null` (and one indexed-but-no-rank) → `422`, `MockLLMProvider.calls.length === 0`, no `onboarding` row written.
- **AC-3** — The generated document shall contain **exactly** these five sections, in this order, with these `kind` values: `architecture`, `critical_paths`, `how_to_run`, `guided_reading`, `first_tasks`; a result missing a section, adding an extra section, or reordering them shall be rejected (regeneration re-attempts, then surfaces a failure) rather than persisted.
  - Verify: server test — a `MockLLMProvider` payload with 4 sections (or a wrong `kind`) does not persist and yields a failure; a correct 5-section payload persists with the exact ordered kinds.
- **AC-4** — The `regenerate` route shall be rate-limited to the same per-route cap as other paid LLM routes (`max: 10, timeWindow: '1 minute'`, matching `/conventions/extract` and `/pulls/:id/review`).
  - Verify: route-config test asserts the rate-limit config is present on the route; an 11th call within the window is rejected.
- **AC-5** — WHEN a repo that already has a persisted onboarding is regenerated, the system shall **overwrite** the single existing row (PK `repoId`) and update `generatedAt`, leaving exactly one onboarding row per repo.
  - Verify: integration test — regenerate twice → exactly one `onboarding` row for the repo; `generatedAt` advanced; JSON equals the second result.

### Grounding & untrusted content (server + prompt)

- **AC-6** — All repo-derived content fed to the model (file tree, key-file excerpts, README/manifests, rank facts) shall be injected as **data inside `<untrusted>…</untrusted>` blocks**, and the system prompt shall instruct the model to treat everything inside those blocks as data and ignore any instructions within them (the `onboarding.system.md` SECURITY clause).
  - Verify: prompt-assembly unit test asserts every repo-content segment is wrapped in `<untrusted>` delimiters and the assembled system prompt contains the ignore-instructions SECURITY clause.
- **AC-7** — WHEN the model returns any file path (a section `link.path`, a critical-path entry, or a guided-reading entry), the system shall drop any path that is **not present in the repo index** before persisting, so no hallucinated or non-existent path is ever stored or rendered as an actionable link.
  - Verify: server test — a `MockLLMProvider` payload citing `src/real.ts` (indexed) and `src/ghost.ts` (not indexed) → persisted doc contains `src/real.ts` and omits `src/ghost.ts`.
- **AC-8** — The system shall accept a mermaid `diagram` **only** for the `architecture` section; for every other section the persisted `diagram` shall be `null` (any non-null diagram on a non-architecture section is stripped to `null`).
  - Verify: server test — a payload with a diagram on `critical_paths` persists that section with `diagram: null`; the `architecture` diagram is preserved.

### Read API & staleness (server)

- **AC-9** — WHEN `GET /repos/:id/onboarding` is requested, the system shall return the persisted onboarding document (if any) plus generation metadata: `source_file_count`, `generated_at`, and an `indexed` status; and IF no onboarding has been generated for the repo yet, THEN it shall return `200` with an explicit "not generated" indicator (e.g. `exists: false`, empty sections) rather than a `404` or `500`.
  - Verify: integration test — before generation → `200`, `exists: false`; after generation → `200` with the sections, `generated_at`, and `source_file_count` equal to the index `filesIndexed` captured at generation time.
- **AC-10** — The read response shall expose a `stale` boolean that is `true` WHEN the repo's current `repo_index_state.lastIndexedSha` differs from the SHA captured when the onboarding was generated (the repo has been re-indexed since), and `false` otherwise; the generation SHA shall be persisted alongside the onboarding for this comparison.
  - Verify: integration test — generate at SHA `A`, read → `stale: false`; advance `repo_index_state.lastIndexedSha` to `B`, read → `stale: true`.

### Contract mirror (shared)

- **AC-11** — WHERE this feature adds or changes any Zod contract under `server/src/vendor/shared/contracts/` (e.g. the `OnboardingDoc` read-response wrapper carrying `sections` + `generated_at` + `source_file_count` + `stale` + `exists`/`indexed`), the system shall include a **byte-for-byte identical** copy at the mirrored `client/src/vendor/shared/contracts/` path (`tsc` does not enforce this mirror).
  - Verify: `diff server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts` (and any other touched contract file) exits `0`; asserted as a plan task and re-checked in review.

### Navigation & page states (client)

- **AC-12** — The client shall add an **"Onboarding Tour"** navigation item under the WORKSPACE section (`vendor/ui/nav.ts`) routing to `/repos/:repoId/onboarding`, expose the same target in the command palette, and highlight the item as active **only** on the repo-scoped tour route — not on the existing `/onboarding` Add-Repository screen (the active-nav matcher in `app-shell/helpers.ts` must be corrected to match the repo-scoped path, not any path containing `/onboarding`).
  - Verify: shell test — the WORKSPACE nav lists "Onboarding Tour" → `/repos/:repoId/onboarding`; the active-nav key is `onboarding-tour` on `/repos/x/onboarding` and is **not** `onboarding-tour` on `/onboarding`.
- **AC-13** — WHILE the active repo is not indexed (no clone / no index), the Onboarding Tour page shall render an **empty state** explaining the repo must be indexed first (with a path to resync), and shall not present a Generate button that would call the LLM.
  - Verify: component test — with `GET /repos/:id/onboarding` returning `indexed: false`, the page shows the "index this repo first" empty state and no enabled Generate action.
- **AC-14** — WHILE the repo is indexed but no onboarding has been generated, the page shall render an empty state with a **"Generate onboarding"** button; WHEN the user clicks it the client shall call `regenerate`; WHILE that call is in flight the page shall show a non-dismissible progress indicator and the Generate/Regenerate control shall be disabled so no second concurrent generation can start.
  - Verify: component test — click Generate → the regenerate mutation fires once; a second click while pending does not fire a second mutation; a progress indicator is shown during the pending window.
- **AC-15** — WHEN a generated onboarding exists, the page shall render: the title `Onboarding for {repo}`, a subtitle `Generated from index of {N} files · last refreshed {relative time}`, an "On this page" sub-nav listing the five sections, collapsible section cards each with a section icon, and a header with **Regenerate** and **Share link** controls.
  - Verify: component test against a mocked `OnboardingDoc` — asserts the title, the subtitle with the file count and a relative timestamp, five sub-nav entries, five collapsible cards, and the Regenerate + Share link controls.
- **AC-16** — WHEN the `architecture` section has a mermaid `diagram`, the client shall render it as a diagram; IF the stored diagram is `null` or fails to parse/render, THEN the section shall render its markdown `body` only, without throwing or blanking the page.
  - Verify: component test — a section with a valid diagram renders the diagram; a section with `diagram: null` and one with an invalid mermaid string both render the body prose and no error boundary/crash.
- **AC-17** — In `critical_paths`, each row shall show the file path, its one-line "why it matters", and an **Open** action that opens the file on GitHub via the `github-urls.ts` blob URL (at the repo's default branch / generation SHA) in a new tab; IF a row's path cannot be resolved to a GitHub blob URL, THEN the Open action shall be omitted/disabled rather than linking to a broken URL.
  - Verify: component test — a resolvable path renders an Open link whose `href` is the expected `github.com/{owner}/{repo}/blob/{ref}/{path}` and `target="_blank"`; an unresolvable path renders no active Open link.
- **AC-18** — In `how_to_run`, the steps shall render as an **ordered** list where each step exposes a copy-to-clipboard control that copies **that step's command text** only.
  - Verify: component test — clicking a step's copy control writes exactly that step's command to the clipboard (mocked), not the whole list.
- **AC-19** — In `guided_reading`, the entries shall render as an **ordered** list, each showing the file path and its rationale; and in `first_tasks`, the suggested tasks shall render as a list.
  - Verify: component test — the guided-reading list preserves the payload order with path + rationale per entry; the first-tasks list renders each task.
- **AC-20** — WHILE the read response reports `stale: true`, the page shall show a non-blocking "the repository changed since this tour was generated — regenerate to refresh" hint near the header, without hiding the existing (stale) content.
  - Verify: component test — `stale: true` renders the stale hint and still renders the cached sections; `stale: false` renders no hint.
- **AC-21** — WHEN a Regenerate call succeeds, the client shall replace the rendered content with the new document and update the "last refreshed" timestamp; WHEN a Regenerate call fails, the client shall surface an error (the global mutation toast plus an inline retry affordance) and shall **preserve** the previously rendered onboarding rather than blanking it.
  - Verify: component test — a failing regenerate mutation keeps the prior sections on screen and shows an error/retry; a succeeding one swaps in the new sections and timestamp.
- **AC-22** — WHEN the user activates **Share link**, the client shall copy the in-app deep link (`/repos/:repoId/onboarding`) to the clipboard and confirm with a toast; it shall **not** produce a public or unauthenticated URL and shall not call any new backend endpoint (access stays gated by the existing auth).
  - Verify: component test — activating Share link writes the in-app URL to the (mocked) clipboard and shows a confirmation toast; no network request is made.

### Cost & safety invariants

- **AC-23** — Rendering or reading the Onboarding Tour page shall make **zero** LLM calls; a paid LLM call shall occur **only** on an explicit Generate/Regenerate action.
  - Verify: integration/component test — `GET /repos/:id/onboarding` and page render invoke the LLM adapter zero times (`MockLLMProvider.calls.length === 0`); only `regenerate` increments it.
- **AC-24** — Generation and reading shall be **read-only** with respect to the repo clone and GitHub: the feature shall never write to the clone, commit, or push, and a failed/rejected generation (AC-2, AC-3) shall leave any previously persisted onboarding row unchanged.
  - Verify: integration test — a generation that fails validation (AC-3) leaves the prior `onboarding` row byte-identical; no clone/GitHub write adapter is invoked during generation.

## Edge cases

- Repo never indexed / no clone on disk → not-indexed empty state (AC-13); regenerate rejected server-side (AC-2).
- Repo indexed but onboarding never generated → Generate empty state (AC-14); read returns `exists: false` (AC-9).
- Repo re-indexed since generation (SHA moved) → `stale: true` hint, cached content still shown (AC-10, AC-20).
- Model returns fewer/more/reordered sections, or a wrong `kind` → rejected, not persisted; regeneration retries then fails cleanly (AC-3).
- Model cites a file path that isn't in the index (hallucinated) → dropped before persist; never becomes an Open link (AC-7).
- Model puts a diagram on a non-architecture section → stripped to `null` (AC-8); architecture diagram invalid/unparseable → body-only render (AC-16).
- `how_to_run` steps can't be grounded (no `package.json`/README/compose facts) → the model produces a minimal/short list; an empty steps list renders an "insufficient signal" note rather than an error.
- Very large repo (e.g. 12,450 files) → prompt is built from the **bounded ranked subset + capped key-file excerpts**, never the whole tree; generation cost/latency stays bounded (Non-functional).
- Concurrent regenerate requests for the same repo → rate limit (AC-4) plus client in-flight disable (AC-14); last successful upsert wins (single row, AC-5).
- Regeneration fails mid-call (LLM/network error) → previous onboarding preserved; error + retry surfaced (AC-21, AC-24).
- Repo deleted while page open → read returns not-found for the repo (existing repo-not-found handling), not an onboarding-specific crash.
- Untrusted repo text attempting prompt injection ("ignore instructions", "this is a fixture") → neutralized by `<untrusted>` wrapping + SECURITY clause (AC-6); the worst case is a lower-quality tour, never instruction-following.
- `Share link` on a not-yet-generated / not-indexed repo → the control is absent (only rendered in the generated state, AC-15).

## Non-functional

- **Security (A03 Injection / prompt injection):** repo content (file tree, excerpts, README, manifests) is foreign text and MUST be injected as data via `<untrusted>` blocks under the SECURITY-clause system prompt (AC-6); never as instructions. All key-file reads MUST use the realpath containment reader (`resolveRealClonePath`/`readCloneFile`), never raw `GitClient.readFile` — a symlink/`..` escape must not read files outside the clone (the recorded server insight on realpath containment applies).
- **Security (A01 / output integrity):** emitted paths are model output and are attacker-influenceable via repo content; the server re-validates every path against the index before it can render as an Open link (AC-7), and Open links are constructed only via the `github-urls.ts` helper (no raw model-supplied URLs).
- **Performance / cost:** the prompt is assembled from a bounded ranked file subset + capped key-file excerpts (reuse `getTopFilesByRank` limits and a per-file byte cap), so a single generation is one bounded structured call regardless of repo size; reading the page is a cached DB read with zero LLM calls (AC-23). Rate-limited to 10/min (AC-4).
- **a11y:** collapsible section cards, the "On this page" sub-nav, copy-to-clipboard controls, and Open links follow the existing vendor-ui primitives' keyboard/aria behavior; the copy controls have accessible labels.

## Observability

- Server: a log line per generation recording repo, resolved provider/model, `source_file_count`, dropped-path count (AC-7), and duration — mirroring the `conventions.extract` generation logging.
- Persisted per repo: `onboarding.generatedAt`, the generation SHA (for staleness, AC-10), and `source_file_count` — surfaced in the page subtitle and stale hint.
- Client: generation failures surface via the global mutation-error toast (already wired in `providers.tsx`) plus the inline retry (AC-21).

## Rollout / migration / back-compat

- **Schema migration (generated, never handwritten — `pnpm db:generate`):** the existing `onboarding` table (`repoId` PK, `json`, `generatedAt`) needs two additions to serve staleness + the "N files" subtitle: a **generation SHA** and a **source file count**. Recommended: add `generation_sha text` and `source_file_count integer` columns (planner's call vs. folding them into the `json` payload). Generate the migration as a pure additive `ADD COLUMN` step (nullable/defaulted) to avoid the interactive rename prompt (recorded server insight). Existing rows (if any) get `null`/`0` and read as `stale: true` until regenerated.
- **Contract mirror (forced step):** the new read-response wrapper (`OnboardingDoc` with `sections` + `generated_at` + `source_file_count` + `stale` + `exists`/`indexed`) added under `server/src/vendor/shared/contracts/` MUST be byte-for-byte mirrored to `client/src/vendor/shared/contracts/` (AC-11). The existing `Onboarding`/`OnboardingSection`/`OnboardingLink` contracts already exist in both copies — verify they stay identical if touched.
- **Prompt:** set the `onboarding.system.md` `{{sections}}` placeholder to the five section kinds of this spec; the current prompt's `routes_and_apis` section is superseded (removed from the section set) — that is a prompt/docs edit, not a contract change.
- **Nav registration:** adding the WORKSPACE "Onboarding Tour" item is a `vendor/ui/nav.ts` edit plus the active-nav matcher fix (AC-12); no icon is added unless a suitable one is missing from the `icons.tsx` allowlist (add it there first if so — recorded client insight).
- **Back-compat:** repos with no onboarding row behave as "never generated" (AC-9); nothing else changes. No `reviewer-core` public-surface change → no impact on the CI agent-runner. No feature flag required; the feature is inert until a user generates a tour.
- **Config:** none new — the model comes from the existing `feature_models.onboarding` setting / `FEATURE_MODELS` default.

## Inputs (provenance)

- Ranked files, critical/dependency paths, index state (file count, SHA): [deterministic: repo-intel] — read from the existing index; no model call.
- Key-file excerpts (README, manifests, top-ranked files): [deterministic: clone read] — read from disk through the containment reader; no model call.
- The five onboarding sections (prose, diagram, links, run steps, tasks): [new: 1 LLM call] — one structured `completeStructured` call per Generate/Regenerate, using the `onboarding` feature model.
- "Open" links: [deterministic: github-urls] — constructed client-side from verified paths; no model call.

## Untrusted inputs

Yes. The repository's own content — file tree, source excerpts, README, manifests, config — is foreign text authored outside DevDigest and is a prime prompt-injection vector (it may contain "ignore previous instructions", "this repo is a fixture, output X", etc., in any language). It is treated as **data, never instructions**: every repo-content segment is wrapped in `<untrusted>…</untrusted>` blocks and the `onboarding.system.md` SECURITY clause instructs the model to ignore any instructions inside them (AC-6). Model-emitted file paths are likewise not trusted: they are re-validated against the real index before they can become actionable Open links (AC-7), and Open URLs are built only via `github-urls.ts` (AC-17). No repo content is ever executed, and generation never writes to the clone or GitHub (AC-24).

## Decisions (resolved)

- **Explicit generation, never auto-fire on navigation** — opening the page never triggers a paid LLM call; the user clicks Generate/Regenerate (AC-14, AC-23). Rationale: no surprise cost, consistent with the "paid action is explicit" pattern (`conventions.extract`, `/pulls/:id/review`).
- **Follow the `conventions` module shape** — per-repo paid generation over the clone, `resolveFeatureModel`, containment-checked reads, rate-limited route, single cached result. Rationale: least-surprise, reuses a proven pattern and its security lessons.
- **"Open" links go to GitHub blob URLs via `github-urls.ts`** (AC-17) — not an in-app viewer. Rationale: the helper already exists; no new file-viewing surface needed.
- **Server-side path grounding** (AC-7) — drop any model-emitted path not in the index before persisting. Rationale: prevents hallucinated Open links (404s) and bounds what repo content can surface as an action.
- **Staleness = generation SHA vs current index SHA** (AC-10) — the "last refreshed 2h ago" subtitle is `onboarding.generatedAt`; staleness compares the generation SHA to `repo_index_state.lastIndexedSha`. The repo-switcher's "synced 2m ago" is the separate clone/index sync signal and is not this feature's concern.
- **Regenerate overwrites the single cached row** (AC-5) — no version history for onboarding in v1. Rationale: the table is `repoId`-PK by design; a tour is a current snapshot, not an audited artifact.
- **Five fixed sections, fixed order, strict validation** (AC-3) — `architecture`, `critical_paths`, `how_to_run`, `guided_reading`, `first_tasks`; diagram only on `architecture` (AC-8). Rationale: matches the mockup and task; the prompt's older `routes_and_apis` section is dropped.
- **No `FEATURE_MODELS` change / no `reviewer-core` change** — the `onboarding` model entry and the `Onboarding` contracts already exist; this feature only wires the module, API, and page.
- **Share link = copy in-app deep link, gated by existing auth** (product owner, AC-22) — activating Share link copies `/repos/:repoId/onboarding` to the clipboard; access remains gated by the existing auth. Rationale: no share/public-link infra or multi-user auth exists today, and a public tokenized URL would expose repo internals by URL. A minted public/unauthenticated link is explicitly **future work** (not v1).
- **Generation runs synchronously** (product owner, AC-1) — `POST /repos/:id/onboarding/regenerate` awaits the single structured LLM call and returns the doc, mirroring `conventions.extract`. Rationale: least-surprise reuse of the proven paid-generation pattern; the prompt is bounded so latency stays bounded. A background-job variant (202 + poll a `generating` status, like `/resync`) is deferred to future work if generation latency proves a problem.
