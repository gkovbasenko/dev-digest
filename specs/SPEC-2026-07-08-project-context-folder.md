# Spec: Project Context Folder  |  Spec ID: SPEC-2026-07-08-project-context-folder  |  Status: approved

Module: cross-cutting (server · client · shared; reviewer-core unchanged)

## Problem & why

Repositories already carry human-written markdown that encodes real intent and rules — API contracts, security baselines, retention policies, architectural invariants — under folders like `specs/`, `docs/`, and `insights/`. Today the review agents never see this text: a spec is a "for humans" document that plays no part in the automated review. Reviewers therefore miss violations that are obvious to anyone who has read the spec (e.g. "module `api/` must not import `db/` directly").

This feature turns that repo markdown into **reviewer context**: a user browses the repo's documents on a dedicated page, **manually attaches** chosen documents to specific agents (and/or skills), sees how many tokens each attachment costs, and — on every run of that agent — the documents' text is read from the repo clone and injected as an **untrusted** `## Project context` block into the prompt, with full visibility in the run trace. No new LLM calls are introduced.

The plumbing is already half-built: `reviewer-core`'s `assemblePrompt` (`reviewer-core/src/prompt.ts`) already accepts a `specs?: string[]` param, wraps it via `wrapUntrusted('spec-…')`, renders it under `## Project context`, and records it in `PromptAssembly.specs`; the `RunTrace` contract already has `specs_read: string[]` and the client already renders both (`TraceBody.tsx`). Today `run-executor.ts` hard-codes `specs: null` / `specs_read: []` — nothing populates them. This feature supplies the discovery, attachment, token-counting, run-time reader, and UI that fill that slot.

## Goals / Non-goals

**Goals**
- A read-only "Project Context" page listing every discovered `.md` document in a repo clone, with its path and a badge (specs / docs / insights).
- Manual attachment of documents to agents (Agent → Context tab) and to skills (Skill → Context tab), storing **paths, not text**, in agent/skill metadata.
- Per-document and aggregate **token counts** shown in the UI.
- Run-time injection: run-executor reads attached paths from the target repo clone and feeds them to `reviewPullRequest({ specs })`, landing in the existing untrusted `## Project context` slot.
- Full run visibility: the attached paths (with token volume) in `specs_read`, and the exact injected text in the expandable prompt-assembly block.
- Zero new LLM calls.

**Non-goals**
- **Auto-selection ("flash-selector")** of which specs apply to a given PR — explicitly out of scope; manual selection only. (Future work.)
- **Creating / uploading / editing / deleting documents** from the Project Context page. The clone is a read-only mirror (`sync()` does `git reset --hard`; the code never commits to it), so files written there are destroyed on the next sync and never reach GitHub. v1 is read-only browse + preview; the Screen-1 create / new-folder / upload / edit toolbar is future work.
- **Screen-1's "Used by N agents" count and coverage ring.** These require cross-repo aggregation of attachments (attachments bind by bare path, not by repo — see Decisions), which is out of v1 scope. Future work.
- **UI editing of the discovered root-folder set** (`specs,docs,insights`). It is server env config only in v1 (see Rollout / config).
- Chunking / embedding / semantic retrieval of documents. Attached documents are injected whole (subject to size caps), not vector-searched.
- Changing the `## Project context` slot mechanics in `reviewer-core` — the param already exists; this feature only supplies its input.
- Any change to `FEATURE_MODELS` — there is no new model-backed feature (token counting is deterministic), so the three-copy `FEATURE_MODELS` registry is untouched.

## Assumptions & dependencies

- Depends on the existing `assemblePrompt` `specs` param, `PromptAssembly.specs`, and `RunTrace.specs_read` (all already shipped) — this feature populates them; it does **not** reshape the `reviewer-core` public surface.
- Depends on the repo clone existing on disk for the target repo (`repos.clonePath`, cloned via `SimpleGitClient`). Documents are read from that clone at run time.
- Reuses the existing safe clone-reader pattern in `server/src/modules/conventions/` (`resolveRealClonePath` = resolve + `realpath` + within-root containment; `readCloneFile`) and the existing recursive walker `walkClone` (`server/src/modules/repo-intel/pipeline/walk.ts`, which already skips symlinks and bounds file count) — rather than the raw `GitClient.readFile` (`simple-git.ts:129`), which has **no** containment guard.
- Reuses the existing `TiktokenTokenizer` (`cl100k_base`, `server/src/adapters/tokenizer/`) for token counts, promoted from its current "repo-intel only" scope to a container-level dependency usable by this module.
- Attachment persistence mirrors the existing `agent_skills(agent_id, skill_id, order)` join and the `AgentSkillLink` shared contract.
- No multi-user auth today (`LocalNoAuthProvider`); workspace scoping comes from `getContext()` as everywhere else.

## User stories

- As a reviewer-config author, I want to see all of a repo's spec/doc/insight markdown in one place with their paths, so that I know what context is available to attach.
- As a reviewer-config author, I want to attach specific documents to an agent (in an order I control) and see the token cost, so that I can drive the reviewer with real project rules without blowing the token budget.
- As a skill author, I want to attach documents to a skill so that any agent using the skill inherits that context, without re-attaching per agent.
- As a reviewer, I want a PR that violates a documented invariant (e.g. an import boundary) to be caught and to cite the spec, so that the documentation actually enforces itself.
- As a run inspector, I want the run trace to show exactly which documents were read, their token volume, and the exact injected text, so that context is visible, not guessed.

## Acceptance criteria (EARS)

### Discovery & reader (server)

- **AC-1** — WHEN the Project Context endpoint is requested for a repo that has a clone on disk, the system shall return every file whose clone-relative path matches `**/{specs,docs,insights}/**/*.md` (root-folder set configurable, default `specs,docs,insights`), each item carrying its clone-relative `path` and a `badge` of `specs` | `docs` | `insights` derived from the nearest enclosing matched root folder.
  - Verify: server integration test against a fixture clone containing `specs/a.md`, `docs/b.md`, `deep/nested/insights/c.md`, `src/x.md`, `specs/notes.txt` → response contains exactly `a.md` (specs), `b.md` (docs), `c.md` (insights); `src/x.md` and `specs/notes.txt` are absent.
- **AC-2** — The system shall read a document's bytes only through a realpath-based containment check (resolve → `realpath` → assert within clone root), and IF a resolved path escapes the clone root (via `..`, an absolute path, or a symlink whose target is outside the root) THEN the system shall treat the document as unreadable and shall not read or inject its content.
  - Verify: reader unit test with (a) `../../etc/passwd`, (b) a committed symlink `specs/evil.md → /etc/hostname` — both return null/omitted; asserted like the existing `conventions-helpers` symlink tests.
- **AC-3** — IF the repo has no clone on disk (never indexed), THEN the Project Context endpoint shall return an empty document set with a machine-readable "not indexed" indicator, and shall not throw a 500.
  - Verify: integration test requesting a repo whose `clonePath` is null → 200 with empty list + `indexed: false`.

### Attachment model — paths, not text (server + shared)

- **AC-4** — WHEN a user sets an agent's attached documents, the system shall persist an **ordered list of clone-relative paths** in agent metadata and shall **not** persist the documents' text anywhere in agent metadata or the prompt template.
  - Verify: after `POST /agents/:id/context` with `{ paths: ["specs/a.md","docs/b.md"] }`, the stored row/join contains those two path strings in order and no document body; asserted by DB read in an integration test.
- **AC-5** — WHEN a user sets a skill's attached documents, the system shall persist an ordered list of clone-relative paths in skill metadata (paths only), and any agent that links that skill shall inherit those paths at run time.
  - Verify: integration test — attach `specs/a.md` to skill S, link S to agent A with no direct agent attachments, run A → `specs/a.md` appears in the run's `specs_read`.
- **AC-6** — WHERE this feature adds any new Zod contract under `server/src/vendor/shared/contracts/`, the system shall include a byte-for-byte identical copy at the mirrored `client/src/vendor/shared/contracts/` path (the server↔client mirror is not enforced by `tsc`).
  - Verify: `diff server/src/vendor/shared/contracts/<new>.ts client/src/vendor/shared/contracts/<new>.ts` exits 0; asserted as a plan task and re-checked in review.

### Token counting (server + client)

- **AC-7** — WHEN document metadata is surfaced (Project Context page, Agent Context tab, Skill Context tab), the system shall display a token count **per document**, computed with the shared tokenizer, prefixed to signal it is an estimate (e.g. `≈ 317 tokens`).
  - Verify: component test — a row for a document of known content renders `≈ <n> tokens` where `<n>` equals `TiktokenTokenizer.count(body)`; server test asserts the count field equals the tokenizer output for a fixture body.
- **AC-8** — WHILE the Agent Context tab has one or more documents attached, the system shall display an **aggregate** token estimate and the fixed note `Injected as an untrusted block (## Project context) into every run` in the tab footer, where the aggregate equals the sum of the attached documents' per-document counts (after dedup, see AC-11).
  - Verify: component test — attach two docs of counts 100 and 217 → footer shows `≈ 317 tokens · Injected as an untrusted block (## Project context) into every run`.

### Run-time injection (server)

- **AC-9** — WHEN a review run starts for an agent that has attached documents (directly or via a linked, enabled skill), the system shall read each attached path from the **target PR's repo clone** and pass the resulting texts as `reviewPullRequest({ specs })`, so they render in the existing untrusted `## Project context` block (each wrapped via `wrapUntrusted`, covered by `INJECTION_GUARD`).
  - Verify: `run-executor` integration test with a `MockLLMProvider` asserts the assembled user message contains `## Project context` and the attached document's text inside `<untrusted …>` delimiters.
- **AC-10** — The `wrapUntrusted` source label for each injected document shall carry the document's clone-relative path (provenance), so the assembled block attributes each block to its source file.
  - Verify: assembled-prompt test asserts the untrusted wrapper for `specs/a.md` includes `specs/a.md` as its `source`.
- **AC-11** — WHEN both an agent-level attachment and a skill-inherited attachment reference the same path, the system shall inject that path's content **exactly once**; and the injected order shall be agent-level documents first (in their configured order), then skill-inherited documents (skill order, then per-skill doc order), each distinct path appearing at its first occurrence.
  - Verify: integration test — agent attaches `[a.md, b.md]`, linked skill attaches `[b.md, c.md]` → injected order is `a.md, b.md, c.md`, `b.md` present once; asserted on the `specs` array passed to `reviewPullRequest`.
- **AC-12** — IF an attached path does not exist (or is unreadable per AC-2) in the target clone at run time, THEN the system shall skip that document (not inject it), emit a Live Log warning naming the path, mark it as missing in the trace's `specs_read`, and complete the run successfully (best-effort, like the callers / repo-map enrichments).
  - Verify: integration test — attach `specs/gone.md` (absent) plus `specs/a.md` (present) → run status `done`, `## Project context` contains `a.md` only, Live Log has a warning for `specs/gone.md`, and `specs_read` marks `specs/gone.md` as missing.
- **AC-13** — IF a document's token count exceeds the per-document cap of **50,000 tokens**, THEN the client shall block attaching it (disabled/blocked control with a warning naming the cap) AND the API shall reject persisting an attachment for it, so an over-cap document can never be attached.
  - Verify: component test — a document counted at > 50,000 tokens renders a blocked/disabled attach control with a cap warning and does not fire the set-context mutation; server test — `POST /agents/:id/context` including an over-cap path returns a 4xx and does not persist it.
- **AC-14** — WHILE attaching or reordering a document would push an agent's (or skill's) **aggregate** attached token count above **150,000 tokens**, the client shall block the save with a warning naming the aggregate cap AND the API shall reject the resulting set, so a persisted attachment set can never exceed the aggregate cap.
  - Verify: component test — attaching a document that would push the aggregate over 150,000 tokens shows the aggregate-cap warning and blocks save; server test — a `POST …/context` whose resulting set exceeds 150,000 tokens returns a 4xx and persists nothing.
- **AC-15** — The feature shall introduce **zero** additional LLM calls: a run with attached documents shall make the same number of provider calls as the same run with none.
  - Verify: `run-executor` test counts `MockLLMProvider.calls` for identical runs with and without attachments → equal.

### Run visibility (server trace + client)

- **AC-16** — WHEN a run with attached documents completes, the system shall populate `RunTrace.specs_read` with the attached document paths (including the missing markers from AC-12) and populate `PromptAssembly.specs` with the exact assembled `## Project context` text that was sent.
  - Verify: integration test reads the persisted trace jsonb → `specs_read` lists the attached paths and `prompt_assembly.specs` equals the untrusted block sent to the provider.
- **AC-17** — WHEN a user opens a completed run's trace, the client shall render the attached documents under a "Specs read" field in the Configuration block, and an **expandable** prompt-assembly block labeled as project context (untrusted) whose expanded body shows the full injected text exactly as sent.
  - Verify: component test on `TraceBody` with a trace whose `specs_read` and `prompt_assembly.specs` are populated → "Specs read" lists the paths and the project-context block expands to reveal the injected text.

### UI surfaces (client)

- **AC-18** — The client shall add a "Project Context" navigation item under the WORKSPACE section that routes to the Project Context page (reusing the existing reserved `nav.context` label).
  - Verify: shell test asserts a WORKSPACE nav item labeled "Project Context" linking to the Project Context route; command palette exposes the same "Go to Project Context".
- **AC-19** — The Project Context page shall list discovered documents with their paths and badges, allow previewing a document's content **read-only** (no create / upload / edit / delete affordances in v1), and show an indexed-status footer; and WHERE the repo is not indexed it shall show an empty state rather than an error.
  - Verify: component test renders the page against a mocked document list → rows show path + badge; clicking a row shows a read-only preview; no create/upload/edit/delete controls are present; the not-indexed response renders the empty state.
- **AC-20** — The Agent editor shall have a "Context" tab that lists attachable documents with a drag handle, a checkbox, the document name, a specs/docs/insights badge, a "Filter documents…" search, and a per-document Preview action, with a header reading "Project context — N of M attached"; toggling attaches/detaches and drag reorders, persisting an ordered path list (AC-4).
  - Verify: component test — toggling a checkbox calls the set-context mutation with the expected ordered `paths`; the header reflects N of M; reordering by drag updates order; matches the existing SkillsTab optimistic-list conventions.
- **AC-21** — The Skill editor shall have a "Context" tab with a "Project context to use" section explaining inheritance and a "SERIALIZES AS" preview listing the attached document paths (e.g. `## Project specifications` / `- specs/public-api.md`).
  - Verify: component test — attaching `specs/public-api.md` renders the serialization preview containing `- specs/public-api.md`.

### Live acceptance scenario (end-to-end)

- **AC-22** — WHEN a document stating an invariant (e.g. "module `api/` must not import `db/` directly") is attached to an agent, and that agent reviews a PR that introduces a violating import, THEN the agent shall produce a finding for the violation whose rationale references the attached document.
  - Verify: end-to-end / integration review (mock or recorded provider) — attach the invariant doc, run the agent against a diff adding `import … from 'db'` in `api/`, assert a finding is emitted and its text cites the spec. (Grounding gate still applies — the finding must intersect a real diff hunk.)

## Edge cases

- Repo never indexed / no clone on disk → empty document set, `indexed: false`, no error (AC-3).
- Attached path deleted or renamed in the target clone since attachment → skipped + recorded (AC-12); the attachment row is **not** auto-pruned (the file may return on a later sync).
- Same path attached at agent level and via one or more skills → injected once (AC-11).
- Document exceeding the 50k-token per-doc cap → attach is blocked in the UI and rejected by the API; it can never be attached (AC-13).
- Attachment set that would exceed the 150k-token aggregate cap → save is blocked in the UI and rejected by the API (AC-14).
- A document within the caps at attach time that later grows past a cap in the clone (paths are stored, text read fresh) → in v1 caps are enforced only at attach/save time; the document is still injected as-is at run time (no run-time re-capping). (Future work if this proves a budget risk.)
- Symlinked document escaping the clone, or `..` traversal in a stored path → unreadable, never injected (AC-2).
- Non-`.md` files, and `.md` files outside `specs`/`docs`/`insights` folders → not discovered (AC-1).
- Root folders at any depth (`a/b/specs/c.md`) → discovered; badge from nearest enclosing matched root.
- An agent used across multiple repos: a path present in repo X but absent in repo Y → injected for X, skipped for Y (AC-12) — see repo-scoping decision.
- Empty document (0 bytes) → 0 tokens, injectable but contributes nothing; not an error.
- Document with `</untrusted>` in its body → neutralized by the existing `wrapUntrusted` escaping (`reviewer-core/src/prompt.ts`).
- Concurrent edits to an agent's attachment list → follow the existing skills-linking mutation/order conventions (optimistic list, `isPending` guard).

## Non-functional

- **Security (A05 Injection / prompt injection):** every document is foreign repo text and MUST be injected as data, never instructions — via the existing `wrapUntrusted` + `INJECTION_GUARD` path. The run-time reader MUST use realpath containment (AC-2); the raw `GitClient.readFile` (no guard) must not be used for this.
- **Security (A01/path traversal):** stored paths are attacker-influenceable (a workspace user picks them; the discovery list constrains the UI but the API must not trust the client) — the reader re-validates containment server-side on every read.
- **Performance:** discovery reuses the bounded `walkClone` (skips symlinks, caps file count); token counting is O(bytes) and cached where practical; the per-doc (50k) and aggregate (150k) token caps are enforced at attach/save time (AC-13/AC-14) so an attachment set is bounded before any run. No new provider calls (AC-15).
- **a11y:** the Context tab controls (checkbox, drag handle, filter, preview) follow existing vendor-ui primitives' keyboard/aria behavior; drag reorder must have a non-pointer fallback consistent with the existing SkillsTab.

## Observability

- Live Log lines during a run: number of documents attached, per-path read success/skip (missing), and total injected token estimate — mirroring the existing `callers digest` / `repo map` Live Log lines in `run-executor.ts`.
- Persisted per run: `RunTrace.specs_read` (attached paths + markers) and `PromptAssembly.specs` (exact injected text) — already in the contract, populated by this feature.
- The Project Context page footer surfaces indexed status (file count, last-indexed signal) from existing repo-intel indexing state where available.

## Rollout / migration / back-compat

- **Schema migration (generated, never handwritten — `pnpm db:generate`):** new attachment storage for agents and skills. Recommended shape mirrors `agent_skills`: `agent_context_docs(agent_id, path, order)` and `skill_context_docs(skill_id, path, order)`, paths only. (A `jsonb string[]` column, like `skills.evidenceFiles`, is a lighter alternative but loses per-row ordering ergonomics — planner's call.)
- **Contract mirror (forced step):** new shared contracts (document list item, attachment link, token-count fields) added under `server/src/vendor/shared/contracts/` MUST be byte-for-byte mirrored to `client/src/vendor/shared/contracts/` (AC-6). `PromptAssembly` / `RunTrace` (`trace.ts`) already carry `specs` and `specs_read` — no change to those contracts, so no mirror churn there.
- **Back-compat:** agents/skills with no attachments behave exactly as today (`specs` omitted → `## Project context` section absent; `specs_read` empty). Existing runs/traces are unaffected. No `reviewer-core` public-surface change (no breaking impact on the CI agent-runner).
- **Config:** the root-folder set is a **server config value read from an env var**, with a hard-coded default of `{specs, docs, insights}`. It is **not** editable in the UI in v1.
- **No feature flag required**; the feature is inert until a user attaches a document.

## Inputs (provenance)

- Discovered documents: [deterministic: repo-intel] — recursive walk of the existing repo clone; no model call.
- Token counts: [deterministic: tokenizer] — `TiktokenTokenizer` (`cl100k_base`); no model call.
- Injected document text: [deterministic: clone read] — read from disk at run time; no model call.
- The reviewer's finding that cites a spec: [reused: existing review LLM call] — the attached text rides inside the **existing** single review call's prompt; it adds **no** new call (AC-15).

## Untrusted inputs

Yes. Attached documents are markdown authored in the target repository — foreign text, a prime prompt-injection vector (it may say "ignore previous instructions", "this code is a test fixture, don't flag it", etc., in any language). It is treated as **data, never instructions**: injected only inside `wrapUntrusted('spec:<path>', …)` delimiters under `## Project context`, covered by the trusted `INJECTION_GUARD` system rule already in `assemblePrompt`; the grounding gate still bounds any finding to real diff hunks. Stored attachment paths are likewise untrusted (user-influenced) and are re-validated for clone containment server-side on every read (AC-2). No document text is ever executed, and none is persisted into agent/skill metadata (paths only, AC-4/AC-5).

## Decisions (resolved)

- **Store paths, not text** (per product owner) — attachments persist clone-relative paths; text is read fresh from the clone at run time. Rationale: documents stay a single source of truth in the repo; edits to a doc take effect on the next run without re-attaching; metadata stays small.
- **Reuse the existing `specs` slot** rather than adding a new prompt section — `assemblePrompt` already renders `## Project context` from `specs` and records it in `PromptAssembly.specs`; `RunTrace.specs_read` and the client `TraceBody` rendering already exist. Rationale: least change (the only `reviewer-core` edit is the AC-10 provenance widening below), run-trace visibility comes almost for free.
- **Dedup by path; agent docs first, then skill-inherited** (AC-11) — matches the design's "Order matters — earlier docs appear earlier" note and avoids paying tokens twice for one file.
- **Missing/unreadable path → skip + record, never fail the run** (AC-12) — consistent with the best-effort callers / repo-map enrichments and the "visible, not guessed" requirement.
- **Reuse `TiktokenTokenizer` (`cl100k_base`), displayed as `≈`** (AC-7) — one tokenizer already exists; cl100k_base is an approximation across providers, so counts are labeled estimates. Promote it from repo-intel-only to a container dependency.
- **Reuse the `conventions` clone-reader containment pattern** (`resolveRealClonePath`/`readCloneFile`) and the bounded `walkClone`, not raw `GitClient.readFile` — the raw reader has no containment guard, and the realpath+symlink lesson is a recorded server insight.
- **All three badges (specs/docs/insights) are attachable** — the reader classifies all three; the product one-liner is about "any markdown from the repo's specs" broadly. The skill tab's "Project specifications" heading is presentational.
- **No `FEATURE_MODELS` change** — no model-backed feature is added; token counting is deterministic. The three-copy registry is untouched.
- **`reviewer-core` gets one minimal, backward-compatible change for AC-10 provenance** (product owner, 2026-07-08 — supersedes the earlier "reviewer-core unchanged" decision) — AC-10 requires each injected block's `wrapUntrusted` **source** to be the document's clone-relative path, but today `prompt.ts` labels specs by index (`spec-${i}`), which a bare `string[]` cannot carry. Chosen resolution (Option A): widen the `specs` element from `string` to `{ source, text }` so the path rides through to `wrapUntrusted`. This is additive in practice — no existing caller passes `specs` — so it is not a breaking surface change for the CI agent-runner. (Option B, softening AC-10 to put provenance in the block body instead of the `source=` attribute and keeping `reviewer-core` frozen, was rejected.)
- **Project Context page is read-only in v1** (product owner) — discovered `.md` shown with paths + Preview only; the Screen-1 create / upload / edit toolbar is future work. Rationale: the clone is a `git reset --hard` mirror, so local edits would be clobbered on the next sync and never reach GitHub.
- **Attachment binding = bare path, resolved per-run against the target repo** (product owner) — a missing file at run time skips that document (reflected in `specs_read` / trace), never a hard error (AC-12). Repo-qualified `(repoId, path)` binding is not used in v1. Consequence: Screen-1's "Used by N agents" + coverage ring (cross-repo aggregation) are out of v1 scope (future work). Rationale: keeps one workspace agent usable across repos with the simplest model.
- **Size caps = 50k tokens per document, 150k tokens aggregate, enforced by blocking** (product owner) — exceeding either cap is blocked in the UI (cannot attach past the per-doc cap; cannot save past the aggregate cap) and rejected by the API (AC-13, AC-14). Rationale: a hard pre-run bound is simpler and more predictable than run-time truncation, and keeps the injected block well inside model context limits.
- **Root-folder set = server env config with hard-coded default `{specs, docs, insights}`** (product owner) — not editable in the UI in v1. Rationale: a low-churn operational knob; UI configurability is unneeded for v1.
