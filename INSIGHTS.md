# dev-digest — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-14 — A background agent's `<task-notification>` `<task-id>` can be the agent's own internal ID, not the spawning `tool_use_id` — refines the 2026-07-08 entry below

A background agent's `<task-notification>` `<task-id>` field is not reliably the spawning `tool_use_id` — it can instead be the **spawned agent's own internal agent ID** (the one echoed in the original `Agent` tool-result ack as `"agentId: <id>"`). `.claude/scripts/workflow-retro/parse_run.py` joins notifications to spawns by `tool_use_id` and, when a notification's `<task-id>` is the agent-id form instead, records the spawn as `completed: false, source: "ack-only"` even though the agent fully completed and its report is present in the transcript as a plain-string user message. Anyone reading `parse_run.py`'s output (or writing a future retro) should treat `completed: false` as "the parser found no matching notification," not "the agent didn't finish" — cross-check by searching the transcript for the agent's own distinctive report text before concluding a spawn produced nothing.

**Evidence:** `.claude/scripts/workflow-retro/parse_run.py`; session `575429e7-…jsonl` (Export-to-CI run) — the `implementation-planner` spawn's `tool_use_id` `toolu_01B94FEHMbfUG3vkdQGQnbw2` (line 141) never appears in any `<task-notification>`, but its completion arrives at line 161 with `<task-id>acb45a26e4147cc8b</task-id>` — the agent ID from the original spawn ack, not the tool_use_id.

## 2026-07-10 — architecture-reviewer's DI *rationale* wording trips the "no test-coverage" judge practice; and a `(1)` max-turns error is a turn-1 transient, not budget exhaustion

Two eval traps on `evals/agents/architecture-reviewer`: (1) The "does not fabricate / stays scoped" case (threshold 1.0) failed even though the reviewer correctly folded the `reply?: FastifyReply` param into the ONE `inward-only-dependencies` finding — the JUSTIFICATION prose sank it. Phrasings like "makes `priceOrder` untestable", "prevents test injection of mocks", "HTTP side effects belong in the route" read to the LLM judge as a *separate fabricated test-coverage finding*. Fix is at the AGENT, not the judge: instruct it to justify a finding by the broken boundary (wrong dependency direction / framework leak) and NEVER via testability/mockability (`.claude/agents/architecture-reviewer.md`, "Justify a finding by the boundary it breaks" para). (2) `Reached maximum number of turns (1)` when the case passes `maxTurns: 25` is NOT budget exhaustion — `(1)` = the run errored on turn 1 (transient API hiccup); `run-claude.ts:148` rethrows because no text was collected yet. Re-run the single case; it's flaky, not a regression.

**Evidence:** this session (2026-07-10); after the agent-md edit `pnpm exec vitest run agents/architecture-reviewer/architecture-reviewer.eval.ts` went 4/4 (was strict 2 failing); the flaky checkout case passed in 37s on re-run with no code change. Refines the entry below.

## 2026-07-10 — workflow-eval `trace` gotchas: writes are invisible to `filesRead`, `@import`'d files are never separately Read, forbid cases run full budget

Three traps hit while fixing the `evals/workflow` insights + gotchas cases (refines the entry below): (1) `result.filesRead` records ONLY the `Read` tool (`evals/src/runtime/run-claude.ts:112`) — Write/Edit are invisible, so "did the model RECORD an insight" can't be asserted directly. Proxy it via the mandatory pre-Edit Read of the pre-existing `server/INSIGHTS.md` (Edit requires a prior Read), and the prompt MUST carry concrete `file:line` evidence + an explicit "record it now" — given a vague discovery the model correctly stops to ASK for specifics (the skill demands evidence) and never writes within budget. (2) That write-triggering positive does NOT mutate the repo (verified: md5 unchanged) BECAUSE a `trace` with no `forbidFilesRead` early-stops via `stopWhen` the instant `expectFilesRead` is satisfied — i.e. right after the Read, before the Edit fires. Adding a forbid list disables `stopWhen` (full run) → a real write would land, so never combine "record now" with a forbid list. (3) An `expectFilesRead` target that a CLAUDE.md `@import`s is never separately Read — its content is already in context; `reviewer-core` documents gotchas INLINE in `reviewer-core/CLAUDE.md`'s `## Gotchas` section (+ `@import INSIGHTS.md`), so the anchor is `reviewer-core/CLAUDE.md`, not `reviewer-core/INSIGHTS.md`. (4) A forbid/absence case runs the full `maxTurns` and still asserts `isError===false`; too tight a budget (was 4) guillotines the model mid-answer → max-turns → `isError` (not a forbid violation) → bump to 6.

**Evidence:** this session (2026-07-10); `pnpm eval:workflow` 2→0 failures after the fixes; md5 of `server/INSIGHTS.md`/`reviewer-core/INSIGHTS.md` identical before/after two runs; `stopWhen` logic at `evals/src/dsl/case.ts:168-174`.

## 2026-07-10 — workflow eval `expectFilesRead` must name REAL CLAUDE.md routing targets; always-loaded skills need a behavioral A/B

Two traps in `evals/workflow/review-workflow.cases.ts`: (1) `expectFilesRead` paths must be files that actually exist AND that a CLAUDE.md "Docs (read on demand)" row really routes to — the original cases asserted invented paths (`server/docs/api-contracts.md`, `reviewer-core/docs/pipeline.md`, `reviewer-core/insights/gotchas.md`) that match no repo convention, so every trace failed while the model correctly read the real targets (`docs/agent-prompts/README.md`, `reviewer-core/INSIGHTS.md`). The API-route case has NO routed API-conventions doc at all — assert only the subagent dispatch, not a file. (2) `activated()` (skillsInvoked OR reading `skills/<name>/SKILL.md`) is BLIND to an always-loaded skill like `engineering-insights` — it's `@import`'d into context, never Skill-invoked nor Read — so a `kind:"activation"` positive always fails and the negative passes tautologically. Convert the pair to `kind:"trace"` and A/B on the observable side effect: positive `expectFilesRead:["INSIGHTS.md"]`, negative `forbidFilesRead:["INSIGHTS.md"]` (new DSL facet; forces full-maxTurns run since absence can't be satisfied early).

**Evidence:** this session (2026-07-10); all 4 failures were assertion-path mismatches, not behavior regressions — the run traces showed the model reading the real files each time; added `forbidFilesRead` to the `trace` kind in `evals/src/dsl/case.ts`.

## 2026-07-10 — architecture-reviewer evals grade on rule-ID slugs that must EXIST in the docs first

The `architecture-reviewer` eval (`evals/agents/architecture-reviewer/*.cases.ts`) has practices that demand the finding name an exact slug — `inward-only-dependencies`, `di-discipline`, `reviewer-core-zero-io`, `reviewer-core-ground-findings-gate`. Those slugs are the *ground truth*: they live in `.claude/skills/server-architecture/rules/forbidden.md` (server ids) and `reviewer-core/CLAUDE.md` (reviewer-core ids). If you add a "cite the rule id" practice, add the slug to those docs FIRST and point the agent at them — otherwise no agent can pass (a competent model describes the rule in prose but won't invent a slug that appears nowhere). The `architecture-reviewer-lite` variant is a deliberate control: it is told there is no slug catalogue, so it fails the slug practices BY DESIGN — its vitest "failures" on the checkout/reviewer-core cases are the A/B signal, not a regression. Also: a domain file importing `FastifyReply` AND accepting a `reply?: FastifyReply` param is ONE `inward-only-dependencies` violation — the eval penalizes splitting it into a second invented contract.

**Evidence:** this session (2026-07-10); adding the slug catalogue to `forbidden.md`/`reviewer-core/CLAUDE.md` + a "cite the id / one contract one finding" rule to `architecture-reviewer.md` took strict from 3/6 to 4/4 cases passing; `grep -rn` for the slugs returned zero before the doc edit.

## 2026-07-08 — PR-overview features ship PRE-STAGED (DB table + `FEATURE_MODELS` id + contracts) before they are wired

Both onboarding and risk_brief landed as scaffolding that was present but UNWIRED before the feature was built: a DB table (`onboarding`, `pr_brief`), a `FEATURE_MODELS` entry (`onboarding`, `risk_brief`), and building-block Zod contracts (`Onboarding*`, `RiskBrief`/`Risk`/`Intent`/`BlastRadius`/`SmartDiff`). Before planning a "wire up feature X" task, grep for X in `server/src/vendor/shared/contracts/platform.ts` (`FEATURE_MODELS`), `server/src/db/schema/*`, and the relevant `contracts/*.ts` FIRST — plan against the scaffold and do NOT edit the pre-staged `FEATURE_MODELS` entry (it's the 3-copy registry). Missing this re-derives an already-decided model/table or wrongly adds a registry row.

**Evidence:** `pr_brief` (`server/src/db/schema/reviews.ts`), `risk_brief` (`platform.ts` `FEATURE_MODELS`, openai/gpt-4.1), `RiskBrief`/`Risk` (`contracts/brief.ts`) all pre-existed PR #20; same shape as onboarding PR #19 (`onboarding` table + entry + `Onboarding` contracts).

## 2026-07-08 — Claude Code transcripts: a background agent's report is a `<task-notification>`, not its tool_result

When parsing `~/.claude/projects/<slug>/<session>.jsonl` for multi-agent runs: (1) a `run_in_background` spawn's `tool_result` holds only a "launched successfully" ack (internal metadata — never quote it), NOT the agent's output. The real report arrives later as a **user message whose `content` is a plain string** containing `<task-notification>…<tool-use-id>…<status>…<result>…<output-file>`; join by `<tool-use-id>`, and use `<result>` + that row's timestamp for the real report/duration. A task-id may notify more than once (resumable) — keep the last `completed`. (2) A parallel **wave** is grouped by `message.id`, not the line `uuid` — the harness logs each `tool_use` on its own jsonl line with distinct uuids but a shared `message.id`. (3) Subagents leave **no `isSidechain` rows** in the orchestrator transcript, so per-subagent token usage is unrecoverable — only orchestrator-side `message.usage` exists.

**Evidence:** `.claude/scripts/retro/parse_run.py`; session `efadf848…jsonl` (onboarding `/run-plan` run) — 23/25 spawns resolved via notifications, wave key by `message.id` yielded 19 waves from 25 spawns.

## 2026-07-06 — The feature-model registry (`FEATURE_MODELS`) has THREE copies that must stay in sync

Changing a `FeatureModelId` entry (e.g. its `defaultProvider`/`defaultModel`) requires editing three files, not two: `server/src/vendor/shared/contracts/platform.ts` (source of truth), its byte-for-byte vendored mirror `client/src/vendor/shared/contracts/platform.ts`, AND the separate hand-maintained UI copy `client/src/lib/feature-models.ts`. `tsc` does NOT catch a value drift between them — only a shape change. During the Intent Layer work the `review_intent` default was updated in the server contract and the `lib/` copy but the client *vendored* mirror was missed, leaving the two client copies disagreeing silently.

**How to apply:** after editing `FEATURE_MODELS` anywhere, `diff server/src/vendor/shared/contracts/platform.ts client/src/vendor/shared/contracts/platform.ts` (must be identical) and grep the same entry in `client/src/lib/feature-models.ts`.

**Evidence:** this session (2026-07-06); `diff` of the two `platform.ts` files showed only the `review_intent` `defaultProvider`/`defaultModel` lines diverging after the first pass.

## 2026-06-29 — `client/src/vendor/shared/` is a manual mirror of `server/src/vendor/shared/`

There is no build step that syncs shared Zod contracts from server to client. Any change to `server/src/vendor/shared/contracts/*.ts` must be manually mirrored to the identical path under `client/src/vendor/shared/contracts/`. Missing this causes client `tsc` to silently accept stale types. The two files must be kept byte-for-byte identical for the contracts they share.

**Evidence:** `client/src/vendor/shared/contracts/platform.ts` vs `server/src/vendor/shared/contracts/platform.ts`, PR #2
