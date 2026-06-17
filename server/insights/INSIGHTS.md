# Server Insights

Non-obvious discoveries from real sessions. Specific and actionable — pass the cold-read test.
See also: `insights/gotchas.md` for known quirks at project start.

---

## What Works

## What Doesn't Work

## Codebase Patterns

2026-06-17 — `nullish()` (not `nullable()` or `optional()`) is the convention for optional DTO fields in `platform.ts`. Use `z.number().nullish()` for fields that may be absent from older DB rows — accepts both `null` and `undefined` from Drizzle. ref: server/src/vendor/shared/contracts/platform.ts:157

## Tool & Library Notes

2026-06-17 — Drizzle `selectDistinctOn([col])` requires the first `orderBy()` column to match the DISTINCT ON column. For "latest row per group": `.selectDistinctOn([t.agentRuns.prId], {...}).orderBy(t.agentRuns.prId, desc(t.agentRuns.ranAt))`. Without the matching prId in orderBy, Postgres throws "SELECT DISTINCT ON expressions must match initial ORDER BY expressions". ref: server/src/modules/pulls/routes.ts:1

## Recurring Errors & Fixes

## Session Notes

2026-06-17 — Run Cost Badge: added `last_run_cost_usd` to PR list response. Used `selectDistinctOn` subquery to get most recent agent run cost per PR in a single query (no N+1). No migration needed — `agent_runs.cost_usd` column already existed in the schema. Files: server/src/modules/pulls/routes.ts, server/src/vendor/shared/contracts/platform.ts.

## Open Questions
