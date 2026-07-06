# mcp — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-06 — `dev_digest_get_findings` has no `runId` filter — polling right after `run_review` returns stale pre-run findings

`dev_digest_run_review` returns `{ status: 'running' }` when a run exceeds `WAIT_TIMEOUT_MS`
(default 120s). `dev_digest_get_findings` takes only `repo` + `pr` (no `runId`) and aggregates
open findings across ALL `kind:'review'` rows on the PR, so an immediate follow-up fetch returns
the **pre-run aggregate** (earlier reviews), not the run you just triggered — easy to mistake
historical findings for fresh output. The only signal a run landed is the aggregate changing:
observed verdict `approve`/score 100 → `comment`/88 and finding count 53 → 54 (a new
"Stored Markdown injection" finding) between two identical calls minutes apart.

**How to apply:** after `run_review` returns `status:'running'`, don't treat the next
`get_findings` as this run's result — wait and re-fetch until verdict/score/count changes.
Fix would be a `runId`-scoped fetch or `get_run_status(runId)` tool (tracked in `mcp/README.md` TODO).

**Evidence:** this session (2026-07-06), PR `gkovbasenko/dev-digest#7`, `Security Reviewer`, `runId b3affda4`; `mcp/src/tools/get-findings.ts` accepts only `repo`+`pr`; `mcp/CLAUDE.md` Gotchas (aggregates across all review rows).
