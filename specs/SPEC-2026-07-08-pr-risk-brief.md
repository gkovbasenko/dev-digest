# Spec: Why+Risk Brief (PR Risk Brief)  |  Spec ID: SPEC-2026-07-08-pr-risk-brief  |  Status: draft

Module: server (`modules/reviews/brief`) · client (PR Overview) · shared (`contracts/brief.ts`); reviewer-core unchanged

## Problem & why

A reviewer opening a PR has to reconstruct, from scratch, four things before they can review well: **what** the PR actually does, **why** (its intent + the issue it closes), **how risky** it is to merge, and **what to look at first**. DevDigest already computes every ingredient of that answer separately — the derived **Intent** (`pr_intent`, cheap model), the deterministic **Blast radius** (`getBlast` over repo-intel), the **Smart Diff** grouping (core/wiring/boilerplate with per-file stats), the **linked issue** (resolved from the PR body), **prior PRs** touching the same files, and the repo's **Context Folder** specs. But those live in separate panels; nobody synthesizes them into a single reviewer-facing brief that says "here's the gist, here's the merge-risk level, here are the concrete risks with file references, and here are the N things to read first."

This feature adds that synthesis: a **Why+Risk Brief** produced by **one** structured LLM call over the *already-built* inputs (no new indexing, no diff bodies), cached per-PR, regenerated on a button. It is nearly free because it composes finished artifacts rather than recomputing them.

The plumbing is already half-built (pre-staged, currently unwired): the `pr_brief` table (`server/src/db/schema/reviews.ts` — `prId` PK, `json` jsonb), the `risk_brief` entry in `FEATURE_MODELS` (`server/src/vendor/shared/contracts/platform.ts` — default `openai` / `gpt-4.1`), and the `Risk` / `RiskSeverity` / `Intent` / `BlastRadius` / `SmartDiff` building-block contracts (`server/src/vendor/shared/contracts/brief.ts`, already mirrored to client). What is missing and what this feature adds: a **brief sub-module** under `modules/reviews/` (compose inputs → single structured call → ground → persist), the **read/regenerate API**, the **`risk_brief.system.md` prompt**, the synthesized **`RiskBrief` contract + read wrapper**, and the client **`PrBriefCard`** on the PR Overview tab. The closest existing analog to follow is the **intent** sub-module (`modules/reviews/intent/` — `computeIntent`, single `completeStructured`, linked-issue resolution, `wrapUntrusted`, headers-not-bodies, upsert keyed on `prId`).

## Goals / Non-goals

**Goals**
- A **`POST /pulls/:id/brief`** endpoint that assembles inputs from already-built artifacts — cached **Intent** + **Blast summary** + **Smart-Diff group stats** + **linked issue** + **relevant Context-Folder specs** — makes **exactly one** structured LLM call using the `risk_brief` feature model, grounds and persists the result (one cached row per PR).
- A synthesized **`RiskBrief`**: `{ what, why, risk_level, risks[], review_focus[] }` — risks carrying references to **real** files/endpoints, and a prioritized "read these first" focus list.
- A **`GET /pulls/:id/brief`** cached read (zero LLM calls) exposing the brief + generation metadata (generated-at, stale flag) and an explicit "not generated" state.
- Deterministic, safe **grounding**: every model-emitted file/endpoint reference is verified against the PR's changed files / repo index before it can render as a link; hallucinated references are dropped.
- **No diff bodies** on the input path — only the file list, hunk headers, and Smart-Diff group statistics (same cost/injection posture as intent).
- A client **`PrBriefCard`** on the PR **Overview** tab: risk level by color, `what`/`why` synthesis, risks with file links, and a `review_focus` list linking to the referenced files/lines.
- **Regenerate** on a button; per-PR cache; explicit page states (never-generated, generating, generated, stale, failed).

**Non-goals**
- **A new review pipeline / agent run.** The brief is a single lightweight synthesis call over existing artifacts; it does **not** run reviewer-core, does not produce findings, and does not replace the review verdict/score (those remain a separate concern — see Decisions on `risk_level` vs verdict).
- **Recomputing the inputs.** The brief reads the cached Intent and the deterministic Blast/Smart-Diff; it does not re-index the repo or re-run the intent model as part of generation (see Decisions on the missing-intent fallback).
- **Feeding diff bodies to the model.** Excluded by design (cost + injection).
- **Changing `FEATURE_MODELS`.** The `risk_brief` entry already exists; the three-copy registry is untouched.
- **`reviewer-core` public-surface change.** Generation uses the server LLM adapter + `completeStructured` directly (like intent), not the review pipeline.
- **Per-risk or per-section independent regeneration / edit-in-UI / version history.** Regenerate rebuilds the whole brief and upserts the single row.
- **Auto-generation on navigation.** Opening the Overview tab never fires a paid call; generation is user-initiated.
- **A public/unauthenticated brief URL.** Access stays gated by existing auth.

## Assumptions & dependencies

- The brief is a **member of the `reviews` module** (`server/src/modules/reviews/brief/`), alongside `intent/` and `smart-diff/`, and reuses `ReviewsService.getIntent` / `getBlast` / `getSmartDiff` / `getPriorPrs` directly — no cross-module wiring, no adapter access outside the DI container.
- Reuses the **intent** compute pattern: `resolveFeatureModel(container, workspaceId, 'risk_brief')` → `container.llm(provider).completeStructured({ schema, schemaName, messages })`, validated against the synthesized contract, upserted keyed on `prId`.
- **Linked issue:** re-resolved at brief time from the PR body via the same word-boundary closing-keyword regex used by intent (`LINKED_ISSUE_RE` in `modules/reviews/intent/compute.ts`) + the public `GitHubClient.getIssue`. The GitHub adapter's own `resolveLinkedIssue` is `private` and must not be called (recorded server insight 2026-07-06); duplicate the regex, do not widen the interface. Never throws — a missing/unreachable issue just drops that input.
- **Blast** (`getBlast` → `PrBlastResponse`) is deterministic over repo-intel and may be **degraded** (`index_status`/`degraded` fields); the brief consumes the blast **summary** + `impacted_endpoints` + `impacted_crons`, not the full `downstream` tree — and surfaces a lower-confidence note when blast is degraded.
- **Smart Diff** (`getSmartDiff` → `SmartDiff`) is deterministic (no LLM); the brief consumes **group-level** statistics (per-role file counts and added/deleted line totals from `groups[].files[].additions/deletions`), not the pseudocode summaries or per-line content.
- **Context-Folder specs:** retrieved via the `context` module (`ContextService`, `context` schema) — the specs/docs configured for the repo whose scope overlaps the PR's changed files (`pr_files`); excerpts capped. The exact relevance selection is a `[NEEDS CLARIFICATION]` (see Decisions).
- Reuses `platform/prompts.ts` (`renderPrompt`) + a **new** `server/src/prompts/risk_brief.system.md` (only `onboarding.system.md` exists today); `wrapUntrusted` from `@devdigest/reviewer-core` for untrusted segments.
- Client: PR detail lives at `client/src/app/repos/[repoId]/pulls/[number]/`; the brief renders on the **Overview** tab beside the existing `IntentCard` / Blast panel. Reuses `@devdigest/ui` primitives, the `github-urls.ts` blob helper (and/or the in-app Files-changed diff jump), and TanStack Query hooks via `lib/api.ts`.
- No multi-user auth today (`LocalNoAuthProvider`); workspace scoping comes from `getContext()` as everywhere else. `prId` is the internal PR uuid (as used by every other `/pulls/:id/*` route), not the GitHub PR number.

## User stories

- As a reviewer opening a PR, I want a one-glance brief — what it does, why, how risky it is to merge, and what to read first — so that I start reviewing the right things in seconds instead of reconstructing context by hand.
- As a reviewer, I want each stated risk to point at a real file/endpoint I can click, so that I can jump straight to the code the risk is about (and not chase a hallucinated path).
- As a reviewer, I want a color-coded merge-risk level so that I can triage which PRs need my deepest attention.
- As a repo maintainer, I want to regenerate the brief after new commits land, and to see when the brief is stale relative to the current PR head, so that the brief stays trustworthy.
- As a cost-conscious user, I want the brief to be one cheap synthesis over already-built data (never firing on page open), so that I control when a paid call happens and it stays inexpensive.

## Acceptance criteria (EARS)

### Generation & persistence (server)

- **AC-1** — WHEN `POST /pulls/:id/brief` is requested for a PR with changed files, the system shall assemble inputs from the already-built artifacts (cached Intent, deterministic Blast summary + impacted endpoints/crons, Smart-Diff group statistics, resolved linked issue, relevant Context-Folder specs), make **exactly one** `completeStructured` call using the model from `resolveFeatureModel(workspaceId, 'risk_brief')`, validate the result against the `RiskBrief` contract, upsert it into the `pr_brief` table keyed by `prId`, and return the generated brief.
  - Verify: server integration test with a `MockLLMProvider` returning a valid `RiskBrief` → response is the persisted brief; `MockLLMProvider.calls.length === 1`; the `pr_brief` row for the PR now holds the returned JSON.
- **AC-2** — IF the PR does not exist or has **no changed files** (`pr_files` empty — nothing to brief), THEN `brief` shall return a `422` validation error, shall **not** call the LLM, and shall not write the `pr_brief` table.
  - Verify: integration test against a PR with zero `pr_files` → `422`, `MockLLMProvider.calls.length === 0`, no `pr_brief` row written.
- **AC-3** — The generated brief shall have exactly the shape `{ what, why, risk_level, risks[], review_focus[] }` where `risk_level ∈ { high, medium, low }` (`RiskSeverity`) and each `risks[]` item carries `{ title, explanation, severity, file_refs[] }`; a result with a missing field, an out-of-enum `risk_level`, or a wrong shape shall be rejected (the structured call re-attempts, then surfaces a failure) rather than persisted.
  - Verify: server test — a `MockLLMProvider` payload with an invalid `risk_level` (or a missing `review_focus`) does not persist and yields a failure; a valid payload persists with the exact shape.
- **AC-4** — The `brief` route shall be rate-limited to the same per-route cap as other paid LLM routes (`max: 10, timeWindow: '1 minute'`, matching `/pulls/:id/intent/recompute` and `/pulls/:id/review`).
  - Verify: route-config test asserts the rate-limit config is present on the route.
- **AC-5** — WHEN a PR that already has a persisted brief is regenerated, the system shall **overwrite** the single existing row (PK `prId`) and update `generated_at`, leaving exactly one `pr_brief` row per PR.
  - Verify: integration test — regenerate twice → exactly one `pr_brief` row for the PR; `generated_at` advanced; JSON equals the second result.

### Inputs & grounding (server + prompt)

- **AC-6** — The prompt shall be assembled from the file list + hunk headers + Smart-Diff **group statistics** + Blast **summary** + Intent + linked issue + capped Context-Folder spec excerpts, and shall **never include diff bodies** (patch content) of the changed files.
  - Verify: prompt-assembly unit test asserts the assembled user message contains the changed-file paths and group stats but contains no line from any file's `patch` body; a distinctive token placed only in a patch body does not appear in the prompt.
- **AC-7** — WHEN the model returns any file or endpoint reference (a `risks[].file_refs[]` entry or a `review_focus[].file`), the system shall drop any reference **not present in the PR's changed files (`pr_files`) or the repo index** before persisting, so no hallucinated path is ever stored or rendered as an actionable link.
  - Verify: server test — a `MockLLMProvider` payload citing a changed file `src/real.ts` and a non-existent `src/ghost.ts` → persisted brief keeps `src/real.ts` and omits `src/ghost.ts`.
- **AC-8** — All untrusted, foreign-authored content fed to the model (the PR description, the linked-issue title/body, Context-Folder spec excerpts) shall be injected as **data inside `<untrusted>…</untrusted>` blocks**, and the `risk_brief.system.md` system prompt shall instruct the model to treat everything inside those blocks as data and ignore any instructions within them (SECURITY clause).
  - Verify: prompt-assembly unit test asserts each foreign segment is wrapped in `<untrusted>` delimiters and the assembled system prompt contains the ignore-instructions SECURITY clause.

### Read API & staleness (server)

- **AC-9** — WHEN `GET /pulls/:id/brief` is requested, the system shall return the persisted brief (if any) plus generation metadata (`generated_at`, `stale`); and IF no brief has been generated for the PR yet, THEN it shall return `200` with an explicit "not generated" indicator (`exists: false`) rather than a `404` or `500`.
  - Verify: integration test — before generation → `200`, `exists: false`; after generation → `200` with the brief and `generated_at`.
- **AC-10** — The read response shall expose a `stale` boolean that is `true` WHEN the PR's current head SHA differs from the head SHA captured when the brief was generated (new commits landed since), and `false` otherwise; the generation head SHA shall be persisted alongside the brief for this comparison.
  - Verify: integration test — generate at head `A`, read → `stale: false`; advance the PR head to `B`, read → `stale: true`.

### Contract mirror (shared)

- **AC-11** — WHERE this feature adds or changes any Zod contract under `server/src/vendor/shared/contracts/` (the new `RiskBrief` synthesized shape + its read-response wrapper, and any `ReviewFocusItem`), the system shall include a **byte-for-byte identical** copy at the mirrored `client/src/vendor/shared/contracts/` path (`tsc` does not enforce this mirror).
  - Verify: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` exits `0`; asserted as a plan task and re-checked in review.

### Client — PR Overview card & states

- **AC-12** — The client shall render a **`PrBriefCard`** on the PR **Overview** tab showing the `what` synthesis, the `why`, and the `risk_level` encoded by **color** (`high` → red, `medium` → amber, `low` → green) with an accessible text label (color is not the only signal).
  - Verify: component test against a mocked brief — asserts the `what`/`why` text render and the risk-level indicator carries both the expected color token and an accessible label for each of high/medium/low.
- **AC-13** — The `review_focus` list shall render as an **ordered** "read these first" list, each entry linking to the referenced file (and line, when present) — via the in-app Files-changed jump when resolvable, else the `github-urls.ts` blob URL; IF a focus entry's reference cannot be resolved, THEN it shall render as plain text without an active link rather than a broken link.
  - Verify: component test — a resolvable focus entry renders an anchor to the expected file/line target; an unresolvable one renders no active link.
- **AC-14** — Each `risks[]` item shall render its title, its severity (color-coded), its sentence-length `explanation` as **wrapping** text (never a `Badge` — `Badge` is `white-space: nowrap`, recorded client insight 2026-07-07), and its `file_refs` as links to the referenced files.
  - Verify: component test — a risk with a long explanation renders it in a wrapping text element (`overflowWrap: "anywhere"`), not a Badge; each `file_ref` renders a link.
- **AC-15** — The card shall expose a **Generate/Regenerate** control; WHILE a generate/regenerate call is in flight the control shall be disabled and guarded so a second click cannot fire a concurrent call; WHEN it succeeds the client shall swap in the new brief and update the "generated" timestamp; WHEN it fails the client shall surface the error (global mutation toast + inline retry) and **preserve** the previously rendered brief rather than blanking it.
  - Verify: component test — a second click while pending does not fire a second mutation; a failing regenerate keeps the prior brief on screen with an error/retry; a succeeding one swaps in the new content and timestamp.
- **AC-16** — WHILE no brief has been generated for the PR, the card shall render a compact empty state with a **Generate brief** button (no auto-fire); WHILE the read response reports `stale: true`, the card shall show a non-blocking "new commits since this brief — regenerate to refresh" hint without hiding the existing (stale) brief.
  - Verify: component test — `exists: false` shows the Generate empty state and no auto-mutation on mount; `stale: true` shows the hint and still renders the cached brief.

### Cost & safety invariants

- **AC-17** — Reading or rendering the brief shall make **zero** LLM calls; a paid LLM call shall occur **only** on an explicit Generate/Regenerate action.
  - Verify: integration/component test — `GET /pulls/:id/brief` and the Overview render invoke the LLM adapter zero times (`MockLLMProvider.calls.length === 0`); only `POST /pulls/:id/brief` increments it.
- **AC-18** — Generation and reading shall be **read-only** with respect to the repo clone and GitHub (only adapter reads: `getIssue`, repo-intel, clone reads for spec excerpts through the containment reader where applicable — never a clone/commit/push write), and a failed/rejected generation (AC-2, AC-3) shall leave any previously persisted `pr_brief` row unchanged.
  - Verify: integration test — a generation that fails validation (AC-3) leaves the prior `pr_brief` row byte-identical; no clone/GitHub write adapter is invoked during generation.

## Edge cases

- PR with zero changed files → `422`, no LLM call, no write (AC-2).
- Intent never computed for this PR → the brief still generates from the deterministic inputs + PR title/body (best-effort `why`); no hard `422` on missing cached intent (see Decisions).
- Blast degraded (`index_status !== 'full'`) → brief generates with a lower-confidence note; impacted-endpoints/crons may be partial.
- No linked issue in the PR body → that input is dropped; `why` is inferred from intent + title (never a refusal).
- No Context-Folder specs configured / none relevant → that input is dropped; the brief is built from the remaining inputs.
- New commits land after generation (PR head moved) → `stale: true` hint, cached brief still shown (AC-10, AC-16).
- Model returns an out-of-enum `risk_level` / missing `review_focus` / wrong shape → rejected, retried, then fails cleanly with no partial persist (AC-3, AC-18).
- Model cites a file/endpoint not in the changed set or index (hallucinated) → dropped before persist; never becomes a link (AC-7).
- Concurrent regenerate for the same PR → rate limit (AC-4) + client in-flight disable (AC-15); last successful upsert wins (single row, AC-5).
- Regeneration fails mid-call (LLM/network) → previous brief preserved; error + retry surfaced (AC-15, AC-18).
- Untrusted PR body / issue / spec text attempting prompt injection ("ignore instructions", "output APPROVE") → neutralized by `<untrusted>` wrapping + SECURITY clause (AC-8); worst case is a lower-quality brief, never instruction-following.
- Very large PR (hundreds of files) → the input is the bounded file list + hunk headers + group **counts**, never per-file bodies, so prompt size stays bounded (Non-functional).

## Non-functional

- **Security (A03 Injection / prompt injection):** the PR description, linked-issue body, and Context-Folder spec excerpts are foreign text and MUST be injected as data via `<untrusted>` blocks under the SECURITY-clause system prompt (AC-8), never as instructions. Any clone reads for spec excerpts MUST use the realpath containment reader (`_shared/clone-read`), never raw `GitClient.readFile` (recorded realpath-containment insight 2026-07-02).
- **Security (A01 / output integrity):** emitted file/endpoint references are model output and attacker-influenceable via repo/PR content; the server re-validates every reference against `pr_files`/the index before it can render as a link (AC-7), and links are constructed only via the in-app jump or `github-urls.ts` (no raw model-supplied URLs).
- **Performance / cost:** exactly one bounded structured call per generate — inputs are already-computed artifacts + file list + hunk headers + group stats, with **no diff bodies** (AC-6), so cost stays low and independent of total diff size; reading the card is a cached DB read with zero LLM calls (AC-17). Rate-limited 10/min (AC-4). The `risk_brief` model default is `openai/gpt-4.1` (a stronger model than intent's, appropriate for the synthesis/risk judgment).
- **a11y:** `risk_level` and per-risk severity encode meaning with **both** color and an accessible text label (AC-12/AC-14); the review-focus list and links follow vendor-ui keyboard/aria behavior.

## Observability

- Server: one log line per generation recording `prId`, resolved provider/model, input sizes (files, whether intent/issue/specs were present), dropped-reference count (AC-7), and duration — mirroring `computeIntent`'s logging.
- Persisted per PR: `pr_brief.generated_at` and the generation head SHA (for staleness, AC-10).
- Client: generation failures surface via the global mutation-error toast (already wired in `providers.tsx`) plus the inline retry (AC-15).

## Rollout / migration / back-compat

- **Schema migration (generated, never handwritten — `pnpm db:generate`):** the pre-staged `pr_brief` table has only `prId` + `json`. Add two columns to serve staleness + the "generated" timestamp: **`generated_at timestamptz`** and **`generation_head_sha text`** (both nullable/additive). Generate the migration as a **pure additive `ADD COLUMN`** step to avoid the interactive rename prompt (recorded server insight 2026-07-02). Existing rows (if any) read as `stale: true` until regenerated.
- **Contract (`brief.ts`):** add the synthesized **`RiskBrief`** (`{ what, why, risk_level: RiskSeverity, risks: Risk[], review_focus: ReviewFocusItem[] }`), a new **`ReviewFocusItem`** (`{ file, line?: number, note }`), and a read-response wrapper (`{ exists, stale, generated_at, ...RiskBrief | empty }`). Reuse the existing `Risk` / `RiskSeverity`. The pre-existing aggregate `PrBrief` (`{ intent, blast, risks, history }`) is unused scaffolding — the planner decides whether to retire it or leave it; do **not** repurpose its shape for the persisted brief. Mirror every change byte-for-byte to the client `brief.ts` (AC-11).
- **Prompt:** add `server/src/prompts/risk_brief.system.md` with the synthesis instructions + the `<untrusted>` SECURITY clause + the required output shape. This is a new prompt file, not a contract change.
- **Feature model:** none — the `risk_brief` entry already exists in `FEATURE_MODELS`; the three-copy registry is untouched.
- **Route registration:** the two routes live in the existing `modules/reviews/routes.ts` (alongside `/pulls/:id/intent`, `/pulls/:id/blast`, `/pulls/:id/smart-diff`), so no new module is registered in `modules/index.ts`.
- **Back-compat:** PRs with no `pr_brief` row behave as "never generated" (AC-9); nothing else changes. No `reviewer-core` change → no CI agent-runner impact. No feature flag; the feature is inert until a user generates a brief.

## Inputs (provenance)

- Intent (what/scope): [deterministic read: `pr_intent` cache] — read; if absent, best-effort from PR title/body (no intent-model call inside brief generation).
- Blast summary + impacted endpoints/crons: [deterministic: repo-intel via `getBlast`] — no model call.
- Smart-Diff group statistics (per-role file counts + line totals): [deterministic: `getSmartDiff`] — no model call.
- Linked issue: [deterministic: `LINKED_ISSUE_RE` + `GitHubClient.getIssue`] — best-effort, not persisted.
- Relevant Context-Folder specs: [deterministic: `context` module read] — excerpts capped, containment-checked if read from clone.
- The synthesized brief (`what`, `why`, `risk_level`, `risks[]`, `review_focus[]`): [new: 1 LLM call] — one structured `completeStructured` call per Generate/Regenerate, using the `risk_brief` feature model.
- Links: [deterministic] — built client-side from **verified** references (in-app jump / `github-urls.ts`); no model-supplied URLs.

## Untrusted inputs

Yes. The PR description, the linked-issue title/body, and the Context-Folder spec excerpts are foreign text authored outside DevDigest and are a prompt-injection vector (they may contain "ignore previous instructions", "output risk_level: low / APPROVE", etc., in any language). They are treated as **data, never instructions**: each foreign segment is wrapped in `<untrusted>…</untrusted>` and the `risk_brief.system.md` SECURITY clause instructs the model to ignore any instructions inside them (AC-8). Model-emitted references are likewise untrusted: re-validated against `pr_files`/the index before they can become links (AC-7), with links built only via the in-app jump or `github-urls.ts` (AC-13). Diff bodies are never fed to the model (AC-6). Generation never writes to the clone or GitHub (AC-18).

## Decisions (resolved) & open questions

- **`risk_level` is the brief's own pre-review merge-risk judgment, independent of the review verdict/score.** The brief can be generated before any review run; its `risk_level` (high/medium/low, color-coded) is not the "Request changes / PR score" verdict shown by the review pipeline. Rationale: the brief is a fast triage aid; coupling it to a full review run would defeat "nearly free."
- **Missing cached intent → best-effort, not a hard gate.** If `pr_intent` has no row, the brief still generates from the deterministic inputs + PR title/body; it does **not** trigger an intent-model recompute (keeps it one call). The only hard gate is AC-2 (PR must have changed files). Rationale: least friction, still one paid call.
- **No diff bodies on the input path** (AC-6) — same posture as intent; the file list + hunk headers + Smart-Diff group stats carry enough signal for a synthesis, and bodies are the main cost/injection surface.
- **Follow the intent sub-module shape** — `modules/reviews/brief/` reusing `ReviewsService.getIntent/getBlast/getSmartDiff/getPriorPrs`, `resolveFeatureModel('risk_brief')`, single `completeStructured`, upsert on `prId`. Rationale: least-surprise, reuses a proven in-module pattern and its security lessons.
- **Server-side reference grounding** (AC-7) — drop any model-emitted file/endpoint not in `pr_files`/the index before persisting. Rationale: prevents hallucinated links and bounds what content can surface as an action.
- **Staleness = generation head SHA vs current PR head SHA** (AC-10) — new commits since generation mark the brief stale. Rationale: the brief is about *this* diff; when the diff moves, the brief may be wrong. (Staleness driven by a *new review run's* findings is out of scope — the brief does not consume review findings.)
- **Regenerate overwrites the single cached row** (AC-5), no version history. Rationale: `pr_brief` is `prId`-PK by design; a brief is a current snapshot.
- **No `FEATURE_MODELS` / `reviewer-core` change** — the `risk_brief` model entry and the building-block contracts already exist; this feature wires the sub-module, API, contract, prompt, and card.
- **[NEEDS CLARIFICATION] — Context-Folder spec relevance selection.** How are "relevant specs" chosen for a PR? Proposed default: context docs configured for the repo whose path/scope **overlaps the PR's changed files** (`pr_files`), bounded to a small top-N with capped excerpts. If the `context` module has no per-PR relevance method today, either (a) add a bounded `relevantForPr(prId)` read, or (b) v1 includes **all** configured repo specs up to a token cap and defers relevance ranking. Decision owner: product/planner.
- **[NEEDS CLARIFICATION] — `review_focus` link target.** In-app Files-changed jump (the reviewer-ordered diff already renders `file:line`) vs GitHub blob URL. Proposed default: in-app jump when the file is in the PR diff (keeps the reviewer in DevDigest), GitHub blob fallback otherwise. Confirm the in-app jump target/route exists for a `file:line` deep-link.
