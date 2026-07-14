# Retro — Multi-Agent Review

## 1 — Run

- **Transcript:** `~/.claude/projects/-Users-gkovbasenko-emdash-worktrees-dev-digest-emdash-multi-agents-review-f81vj/070b86e3-15e6-45de-bde6-069112c8d2ba.jsonl` (only candidate; matches this worktree/feature exactly — no ambiguity to confirm).
- **Feature:** Multi-Agent Review (parallel agent fan-out + cross-agent conflict view).
- **Spec:** `specs/SPEC-2026-07-13-multi-agent-review.md` (33 EARS ACs). **Plan:** `docs/plans/multi-agent-review.plan.md` (T1–T11, 4 build waves + verification wave).
- **Branch:** `emdash/multi-agents-review-f81vj` → PR [`gkovbasenko/dev-digest#28`](https://github.com/gkovbasenko/dev-digest/pull/28), merged CI green as of `3ac32fd`.
- **Date:** 2026-07-14.

## 2 — Metrics

| Metric | Value |
|---|---|
| Agent spawns | 21 |
| Waves (parser-detected) | 11 (5 are the plan's build waves; the rest are review/fix/verify singles + two split by a session-limit interruption — see below) |
| Roster | `implementer` ×16, `architecture-reviewer` ×2, `spec-creator` ×1, `implementation-planner` ×1, `plan-verifier` ×1 |
| Assistant turns (orchestrator) | 433 |
| Wall-clock (raw) | 62,092s (~17.25h) — **not real elapsed work**, see below |
| Models | `claude-opus-4-8`, `claude-sonnet-5` |
| Orchestrator token usage | in 844 · out 517,859 · cache-read 113,323,859 · cache-creation 8,022,992 |
| Orchestrator tool-call histogram | `Bash` 98 · `Agent` 21 · `TaskUpdate` 20 · `Read` 10 · `TaskCreate` 8 · `Edit` 6 · `AskUserQuestion` 5 · `SendMessage` 5 · `ToolSearch` 3 · `Skill` 3 · `ScheduleWakeup` 2 |

**⚠️ Per-subagent token cost is UNAVAILABLE** — the orchestrator transcript carries no `isSidechain` rows or usage metadata for spawned agents; every token number above is orchestrator/main-thread spend only. Where per-agent cost would be useful, this report uses **duration** and **report length** as proxies, labeled as such.

**⚠️ Two independent measurement caveats specific to this run:**

1. **Raw wall-clock includes a real, multi-hour idle gap, not active work.** `seq 15` (T10, wave 7) finished at `2026-07-13T20:42:31Z`; `seq 16` (architecture-reviewer, wave 8) spawned at `2026-07-14T04:04:58Z` — a **~7h20m gap**. This is the session-usage-limit exhaustion the user hit mid-run ("You've hit your session limit · resets 1:30am") — the orchestrator was blocked waiting for the limit to reset, not doing 7 hours of work. The 62,092s wall-clock figure is therefore not a throughput number; **active orchestration spanned roughly 3.5h** (19:21 → 20:42 for the build waves, then 04:04 → 04:58 for review/fix/verify after the limit reset).
2. **The parser under-reports resumed agents.** Per the existing root `INSIGHTS.md` entry (2026-07-08, "a background agent's report is a `<task-notification>`, not its `tool_result`... a task-id may notify more than once (resumable) — keep the last completed"), `parse_run.py` does **not** implement that "keep the last" rule for this run's data: several agents were resumed via `SendMessage` after a first `<task-notification>` (the session-limit failure, or a mid-task check-in), and the parser's `duration_s`/`report_chars`/`report_preview` for those rows reflect the **first** notification, not the final one. Confirmed cases: `seq 1` (spec-creator — shows `completed:false`, empty report, despite ultimately producing the full spec + 6-question round-trip via later `SendMessage` turns), `seq 13` (T9 — `report_chars:132`, text `"Now let's write the files..."`, which is the mid-thought fragment from its session-limit failure, not its actual multi-hundred-line final report), `seq 16`/`seq 20` (architecture-reviewer, both `completed:false`/empty despite delivering full Critical/Warning and PASS verdicts). **Do not read the `waves`/`duration_s` fields for these seqs as final state** — this report's qualitative timeline below is corrected against the orchestrator's own conversation record where the parser is known-wrong. This gap in `parse_run.py` is itself worth a fix (see Feed-forward brief).

## 3 — Roster & timeline (corrected)

| Wave | Agents | Real outcome |
|---|---|---|
| 1 | `spec-creator` | Interactive: grounded in 6 mockup screenshots + real code (found `RunRequest` has no subset shape, `multi_agent_runs` unlinked, no conflict-matcher exists), asked 6 clarifying questions in two rounds (first pass couldn't reach the user directly — see below), wrote the approved spec. |
| 2 | `implementation-planner` | One pass, 642.8s measured — reliable figure (not resumed). Verified requirements via 3 parallel internal researchers; correctly flagged 2 decisions it couldn't resolve alone (`AskUserQuestion` unavailable in subagent context). |
| 3 (plan Wave 1) | 5× `implementer` (T1–T5) | True parallel spawn (5 in one message, spawn timestamps 19:21:13–19:21:51, ~38s apart) — the cleanest wave of the run. All 5 disjoint-file, all completed clean on first try. |
| 4 (plan Wave 2, attempt 1) | 2× `implementer` (T6, T7) | **Failed** — both hit the session-usage limit before writing any code (`seq 8`: 71 chars, `seq 9`: 196 chars, both mid-`Read`). Zero code lost; working tree verified clean before re-spawn. |
| 5 (plan Wave 2, attempt 2) | 2× `implementer` (T6, T7) | Fresh spawns (not resumes) after the limit reset, ~5min later. Both completed clean; T6 (1096.5s) was the run's single longest individual implementer task — server "grouping core" touching repo+assemble+service+routes. |
| 6 (plan Wave 3) | 2× `implementer` (T8, T9) | T8 clean in one pass (583s). T9 hit the **same session limit** mid-write (`"Now let's write the files: page.tsx, styles.ts, ..."`) and was resumed via `SendMessage` — the parser's `961.9s`/`132-char` row is the pre-resume state; real span was from spawn (20:15:19) to actual completion, resumed and finished before wave 7 began (~20:42). |
| 7 (plan Wave 4) | 2× `implementer` (T11, T10) | T11 completed clean (1438.1s) and explicitly exported the `FindingDetailActions` interface for T10 to consume. T10 (1471.7s, the run's longest) also hit the session limit mid-write (`"Now the styles and component for AgentTabs."`) and was resumed. **This is the wave that produced the run's biggest miss — see §4.** |
| 8 | `architecture-reviewer` | Found 1 Critical (`AgentsRepository` missing `workspaceId` filter) + 1 Warning (`ConfigureRun.tsx` bypassing the hook layer). |
| 9 (fix loop) | 3× `implementer` | Parallel, disjoint files: workspace-scoping fix, `agent_id`-uniqueness fix (a correctness bug the parallel `/code-review` pass found independently — dup `agentIds` + deleted-agent collision), ConfigureRun hook-reuse + loading-state fix. One of the three (`agents/repository.ts` fix) ran a **risky `git stash`/`pop` in the shared multi-agent worktree** and hit a merge conflict on unrelated files — self-recovered, verified via `git diff`/conflict-marker grep by the orchestrator, no data lost, one orphaned stash entry dropped. |
| 10 | `architecture-reviewer` (re-check) | Confirmed both findings fixed, no new violations — Gate: PASS. |
| 11 | `plan-verifier` | 33/33 PASS, live-run typecheck+test on both modules — **but AC-5's page-renders check and AC-28/29/30's disagree-block checks were graded against isolated component tests, not the actual mounted page — see §4.** |

**Orchestration-efficiency call-out:** waves 3/4/6/7 (the plan's own dependency waves) parallelized correctly (2–5 agents/message, disjoint files by plan design) — no unnecessary serialization on the *planned* side. The only serialization was two unplanned re-spawns forced by the session-usage limit (waves 4→5, and the resumes inside 6 and 7), which cost real wall-clock but not orchestrator turns/tokens beyond the resume messages themselves.

## 4 — What helped / What was hard / Duplicated / Missed

### What helped
- **Wave 1's file-disjointness held perfectly** — T1 (shared contract), T2 (migration), T3 (matcher), T4 (executor), T5 (stats endpoint) never touched each other's files; each implementer's self-verify (`typecheck`+module tests) was sufficient, no integration-gate surprises after that wave.
- **T11's explicit interface contract for T10** (`export { FindingDetailActions }` / `export type { FindingDetailActionsProps }`, documented in its own file header as "STABLE PUBLIC INTERFACE... do not change without checking T10's usage") worked exactly as designed — T10 imported it with zero friction, confirmed in its own report ("existed on disk at integration time... with exactly the promised interface").
- **Existing `INSIGHTS.md` entries were correctly applied** by implementers without re-discovery: server INSIGHTS 2026-06-30 (findings must be scoped per-group, not latest-review) → `multi-agent.repo.ts`'s `getFindingsForReviews`; server INSIGHTS 2026-06-29 (no `cost_usd` column, derive via `estimateCost`, null-safe) → both `agents/service.ts` and `assemble.ts`; server INSIGHTS 2026-07-08 (rate-limit disabled under test) → T6's route-config-based rate-limit test instead of a burst-`inject()`.

### What was hard
- **The session-usage limit hit mid-run three separate times** (wave 4 attempt 1 total loss, T9's and T10's mid-write interruptions) — none caused data loss, but each cost a resume round-trip and, in T9/T10's case, degraded this retro's own measurability (§2, caveat 2).
- **`agent_id` collision** (dup `agentIds` in a request + a deleted agent's null `agentId` both collapsing to a shared identity) was a genuine correctness bug the code-review pass found independently of the architecture-reviewer — evidence it wasn't a redundant finding, it was a distinct defect class the boundary-focused reviewer wasn't positioned to catch.

### Duplicated work
- **`client/messages/en/runs.json` was written by 4 different tasks** (T8 `picker.*`, T9 `page.*`, T10 `column.*`/`tabs.*`, and indirectly `prReview.json` by T11's `finding.comingSoon`) across waves the plan's own Execution map called "disjoint file sets." It worked without a real conflict only because each task appended distinct, namespaced JSON keys — but the plan never flagged the locale files as a deliberately-shared resource, so this held by convention, not by design. A future run with less-disciplined key-naming would collide here.
- **No file was accidentally read/re-derived by multiple agents redundantly** beyond the expected fix-loop touching Wave-1/2 files a second time (by design, to fix a Wave-1/2 gap) — the plan's disjoint-file discipline otherwise held.

### What was missed — the two real gaps (both post-`plan-verifier`, found by the user/orchestrator, not the swarm)
1. **`WhereAgentsDisagree` (T11) was built and unit-tested but never mounted.** No task in wave 7 wired it into `MultiAgentResults.tsx` — T10's own report described building `AgentColumns`/`AgentTabs`/`ModeToggle`/the composition root, and never mentioned the disagree block at all; T11's report explicitly said "mounting these two components into the Results slot is T10's integration job," a hand-off that silently dropped one of the two components. `plan-verifier` graded AC-28/29/30 **PASS** by citing `WhereAgentsDisagree.test.tsx` (an isolated component test) — it never checked the component was reachable from the actual page. This is a **structural blind spot in the verification chain**, not a one-off implementer slip: every gate in this run (implementer self-verify, integration gate, two review passes, plan-verifier) is typecheck+vitest-shaped, and none of them exercises the real app. It surfaced only when the user manually compared the running page to the original mockup screenshots.
2. **`next build`/`next dev` was never run for this feature until after the PR was open**, and it failed both times: `client/src/vendor/shared/contracts/observability.ts` imports `Severity` from `./findings.js` — `tsconfig.json`'s `moduleResolution:"Bundler"` lets `tsc`/vitest silently resolve that to `findings.ts`, but Next's webpack has no equivalent rule, so the moment any file value-imports `observability.ts` (T7's `useMultiAgentRun`), the build 500s in dev and hard-fails in CI (`gh run` `browser flows / Build + start web` on the first push). This is the **same class** of gap as #1: every automated gate in the pipeline (typecheck, vitest, `plan-verifier`) is blind to webpack-specific module resolution, and nothing in `/run-plan`'s stage sequence runs `next build` or hits a live route.

## 5 — Feed-forward brief

For the next `/run-plan` on a UI-shaped feature in this repo, hand agents this up front:

1. **Add a "does it actually run" gate, not just typecheck+vitest.** Before `plan-verifier`'s final pass, run `next build` (client) once and `curl` every new route the plan introduces (`200`, not 404, not a webpack 500) — this would have caught both misses in §4 for free, before the PR even opened.
2. **When a plan splits "build component X" from "build the shell that mounts X" across two parallel tasks (T10/T11's pattern), make the mounting task's Verify line explicit and literal:** `grep -rn "WhereAgentsDisagree" client/src/app/multi-agent/ | grep -v .test.` must return a hit outside the component's own folder — not just "the component's own tests pass."
3. **Any `.ts` file under `vendor/shared/contracts/*` that imports a sibling via a `.js` specifier needs `next.config.mjs`'s `webpack().resolve.extensionAlias` (`{".js": [".ts",".tsx",".js"]}`) present** — this is now fixed repo-wide, but flag it so nobody "fixes" it again narrowly (e.g., another subpath-import workaround) without realizing the general fix already exists.
4. **Locale JSON files (`client/messages/en/*.json`) are a shared-write resource across parallel UI tasks** — namespace keys per task/feature area (as this run did, by luck) and call it out explicitly in the plan's Execution map rather than listing them under "disjoint files."

## 6 — Proposed INSIGHTS

Two candidates. Metrics/timing facts above are intentionally excluded (volatile, forbidden by the engineering-insights skill).

### Candidate A — `client/INSIGHTS.md`

```markdown
## 2026-07-14 — A component built and unit-tested in isolation can still be completely unmounted — grep for its import chain to the page root before calling a UI task done

`WhereAgentsDisagree` (Multi-Agent Review feature) was fully built with passing tests
(`WhereAgentsDisagree.test.tsx`, all ACs green) but was never imported by
`MultiAgentResults.tsx` or any other file reachable from `/multi-agent` — a parallel task
built the results shell and the disagree block in the same wave, and the hand-off ("shell
task mounts it") silently dropped. `plan-verifier`/typecheck/vitest all passed because
nothing in that chain checks *reachability from the page*, only that the component's own
test file exercises its own props correctly.

**How to apply:** when a plan splits "build component X" from "build the shell that mounts
X" into two tasks, before marking either done, run
`grep -rn "<ComponentName>" <feature-root>/ --include="*.tsx" | grep -v ".test."` and confirm
a hit exists OUTSIDE the component's own folder. A green test suite is not evidence of this.

**Evidence:** this session (2026-07-14); `client/src/app/multi-agent/_components/WhereAgentsDisagree/`
built+tested but zero non-test/non-self references until fixed in
`client/src/app/multi-agent/_components/MultiAgentResults/MultiAgentResults.tsx`; caught by
manual comparison against the feature's mockup screenshots, not by any automated gate.
```

### Candidate B — extend the existing `client/INSIGHTS.md` 2026-07-08 barrel-import entry (already applied in this session as a new dated entry, flagging here for awareness since it directly supersedes/generalizes the older one)

Already written to `client/INSIGHTS.md` during the session as "2026-07-14 — A `.js`-suffixed relative import between two `vendor/shared/contracts/*.ts` files builds fine under `tsc`/vitest but fails `next build`/`next dev`..." — no further action needed; listed here only so the retro's INSIGHTS section is complete. Not re-proposing since it was already committed with the fix (`3ac32fd`'s predecessor commit `6400e64`), which itself is a **process deviation worth naming**: this retro's own §4/§5 argues for a "does it actually run" gate in `/run-plan`; the fact that this insight had to be added *outside* that skill's normal flow (I wrote it directly, not via a spawned agent, after the PR was already open) is evidence the gap is real, not hypothetical.
