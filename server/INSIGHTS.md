# server — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-06-29 — `agent_runs` does not store `cost_usd`; derive it at read time

There is no `cost_usd` column on the `agent_runs` table (only `tokens_in`, `tokens_out`, `model`). The `ci_runs` table does have `cost_usd`, which makes the omission easy to miss. Cost must be computed on read via `estimateCost(model, tokensIn, tokensOut)` from `src/adapters/llm/pricing.ts`. If a model slug is not in the pricing table, `estimateCost` returns `null` — this is intentional and safe.

**Evidence:** `server/src/db/schema/runs.ts` (no `costUsd` column), `server/src/adapters/llm/pricing.ts:37`, PR #2

---

## 2026-06-29 — `agentRuns.prId` is typed `string | null` despite being a required FK

Drizzle infers the column as `string | null` even though `prId` is semantically required (every run belongs to a PR). Using it as a `Map<string, …>` key fails `tsc` without a null guard. Pattern: `if (!run.prId) continue` before any Map operation.

**Evidence:** `server/src/db/schema/runs.ts` (column definition), type error hit in `server/src/modules/pulls/routes.ts:146` during PR #2
