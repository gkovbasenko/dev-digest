# server — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-06-30 — A PR can have multiple `reviews` rows; latest-only aggregation hides findings

Each agent run creates its own row in `reviews` (with its own findings via the `review_id` FK). Old reviews are **not** deleted when an agent re-runs or when a different agent runs. The PR detail page reflects this by rendering every review as a separate `ReviewRunAccordion`. So any per-PR aggregation that picks only the latest review (e.g., `ORDER BY created_at DESC LIMIT 1`) will silently mask findings from prior reviews — for example, if the newest review is an "approve / no findings" run.

**How to apply:** for any PR-level rollup of findings (counters, badges, gates), JOIN `findings → reviews` and aggregate by `reviews.pr_id` across all `kind='review'` rows, filtering `findings.dismissed_at IS NULL` for "open" counts. The single-number SCORE may still use the latest review (one row, deliberate), but counts must not.

**Evidence:** `server/src/db/schema/reviews.ts` (no UNIQUE on `pr_id`; `created_at` ordering), `server/src/modules/reviews/run-executor.ts:218` (every run inserts a new review row), bug surfaced on PR #3 where the list showed a green ✓ while the detail page listed open findings.

---

## 2026-06-29 — `agent_runs` does not store `cost_usd`; derive it at read time

There is no `cost_usd` column on the `agent_runs` table (only `tokens_in`, `tokens_out`, `model`). The `ci_runs` table does have `cost_usd`, which makes the omission easy to miss. Cost must be computed on read via `estimateCost(model, tokensIn, tokensOut)` from `src/adapters/llm/pricing.ts`. If a model slug is not in the pricing table, `estimateCost` returns `null` — this is intentional and safe.

**Evidence:** `server/src/db/schema/runs.ts` (no `costUsd` column), `server/src/adapters/llm/pricing.ts:37`, PR #2

---

## 2026-06-29 — `agentRuns.prId` is typed `string | null` despite being a required FK

Drizzle infers the column as `string | null` even though `prId` is semantically required (every run belongs to a PR). Using it as a `Map<string, …>` key fails `tsc` without a null guard. Pattern: `if (!run.prId) continue` before any Map operation.

**Evidence:** `server/src/db/schema/runs.ts` (column definition), type error hit in `server/src/modules/pulls/routes.ts:146` during PR #2
