# server — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-01 — `POST /skills/import` URL fetch requires SSRF protection; raw `fetch()` is unsafe

Any server-side URL fetch driven by user input is an SSRF vector. `POST /skills/import` previously called `fetch(input.url)` with no validation beyond Zod's `z.string().url()` (syntax only). A workspace member could target `http://169.254.169.254/` (AWS metadata), `http://localhost:5432` (postgres), or any internal host. The fix in `server/src/modules/skills/service.ts` (`fetchSkillUrl()`) must be used for ALL future server-side URL fetches from user input:
1. Reject non-HTTPS protocols before DNS resolution.
2. Resolve hostname via `dns.lookup()` and block private/reserved ranges before connecting.
3. Enforce a short `AbortSignal.timeout()`.
4. Cap response body size to prevent memory exhaustion.

**How to apply:** any future endpoint that fetches a user-supplied URL must go through `fetchSkillUrl()` or an equivalent — never raw `fetch(userInput)`.

**Evidence:** `server/src/modules/skills/service.ts` (`fetchSkillUrl`, PR #6 commit `b5c99de`), flagged at 95% confidence in post-PR security review.

---

## 2026-07-01 — Fastify literal route segments must be registered before parameterized ones

Fastify matches routes in registration order. If `GET /skills/:id` is registered before `GET /skills/community`, Fastify attempts to parse `"community"` as a UUID for the `:id` param and returns 422 before the literal route is ever reached. The symptom is a 422 with a Zod/UUID validation error on a request to a path that looks like a static segment.

**How to apply:** in any module where a literal path segment could be mistaken for a param (e.g. `/skills/import`, `/skills/community`), register those literal routes **first**, before any `/:id` route. See `server/src/modules/skills/routes.ts` (comment at top of file explains the ordering constraint).

**Evidence:** `server/src/modules/skills/routes.ts` (registration order: `/skills/import` → `/skills/community` → `/skills/:id`), discovered while designing the skills module in PR #6.

---

## 2026-06-30 — PostgreSQL window functions scan all qualifying rows regardless of outer WHERE

A `ROW_NUMBER() OVER (PARTITION BY ...)` CTE must evaluate every row that matches the base `WHERE` clause before the outer `WHERE rn <= N` filter is applied. This means selecting a large column (e.g. `rationale TEXT`) inside the CTE causes the DB to read it for *all* matching rows — not just the N that survive the outer filter. For a PR list with 50 PRs × 100 findings each, selecting `rationale` inside the CTE transfers ~500KB of text only to discard 95% of it.

**How to apply:** when using `ROW_NUMBER()` to pick top-N per partition, exclude heavy columns from the CTE. After filtering, do a second batched query (`WHERE id IN (...)`) to fetch those columns for only the winners. See `server/src/modules/pulls/routes.ts` (top_findings two-phase query: CTE selects metadata only; post-filter IN-query fetches rationale).

**Evidence:** `server/src/modules/pulls/routes.ts` (commits `c5bc7f5` two-phase split, `9175072` original CTE), flagged in PR #3 review at 70% confidence.

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
