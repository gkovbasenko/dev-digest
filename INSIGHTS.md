# dev-digest — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

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
