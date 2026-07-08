# Retro: Why+Risk Brief (`/run-plan`)

## 1 — Run

- **Transcript:** `~/.claude/projects/-Users-gkovbasenko-app-ai-dev-digest/efadf848-3d28-47a7-ae54-9dd4ef9a165c.jsonl` (a single session that also contains the earlier **onboarding** run; this retro scopes to the **pr-risk-brief** run = spawns #16–24).
- **Feature:** Why+Risk Brief (PR Risk Brief). **Plan:** `docs/plans/pr-risk-brief.plan.md`. **Spec:** `specs/SPEC-2026-07-08-pr-risk-brief.md`.
- **Branch:** `feat/pr-risk-brief` → merged `#20` (`0e4c955`), branch deleted. **Date:** 2026-07-08.

## 2 — Metrics (pr-risk-brief slice)

| Metric | Value |
|---|---|
| Agent spawns (this run) | 9 — planner ×1, implementer ×6, architecture-reviewer ×1, plan-verifier ×1 |
| `/code-review` | run **inline** by the orchestrator (not spawned) — deliberate budget choice after onboarding's finder agents hit the limit |
| Execution waves | planner → {T1,T2} → {T3,T4} → T5(died) → T5(retry) → arch-review(+inline review) → plan-verifier |
| Run wall-clock | 17:11:32 → ~18:50 ≈ **99 min** (incl. ~15 min weekly-limit stall + ~21 min inline gate/review) |
| Fix-loop iterations | **0** (0 Critical/Warning from either axis) |
| AC result | **18 / 18 PASS** |
| Reviewer findings | architecture 0C / 0W / 2 Suggestion · code-review (inline) 0C / 0W / 1 Suggestion |
| Model | claude-opus-4-8 |
| Git corpus | 27 files, **+6348 / −1** (server brief sub-module + 4 test files, client `PrBriefCard` + hooks, shared contract mirror, migration `0017`, spec, plan) |

**⚠️ Per-subagent token spend is UNAVAILABLE** — subagents leave no usage rows in the orchestrator transcript. Every token number below is **whole-session, main-thread** spend and **spans BOTH the onboarding and risk-brief runs** — it cannot be cleanly split per-run from this transcript. Use per-agent **wall-clock duration** and **report length** as the per-run proxies.

| Orchestrator usage (WHOLE SESSION, both runs) | Tokens |
|---|---|
| input | 93,459 |
| output | 475,055 |
| cache-read | 62,258,687 |
| cache-creation | 8,676,458 |

| Tool call (whole session) | Count |
|---|---|
| Bash | 59 |
| TaskUpdate | 26 |
| Agent | 25 |
| Read | 24 |
| TaskCreate | 14 |
| AskUserQuestion | 3 |
| Skill | 2 |
| ToolSearch | 2 |
| Edit / get_findings / Write | 1 each |

## 3 — Roster & timeline (per-agent duration = proxy)

| # | Agent | Task | dur | report chars | outcome |
|---|---|---|---|---|---|
| 16 | implementation-planner | plan risk-brief | 430s | 3513 | plan written; **could not call AskUserQuestion** (subagent), baked 3 provisional decisions |
| 17 | implementer | T1 contract | **91s** | 2623→2149 | clean first pass |
| 18 | implementer | T2 migration | **62s** | 2149 | clean first pass |
| 19 | implementer | T3 server module | 797s | 139 | **died on weekly limit** — but files + tests had already landed (idempotent) |
| 20 | implementer | T4 hooks | 377s | 1509 | clean first pass |
| 21 | implementer | T5 card (attempt 1) | 351s | 148 | **died on weekly limit early — nothing landed** (~351s wasted) |
| 22 | implementer | T5 card (attempt 2) | 1592s | 3382 | clean, 320 client tests green |
| 23 | architecture-reviewer | boundaries | 364s | 4739 | Sound, 0C/0W |
| 24 | plan-verifier | AC-1..18 | 402s | 8203 | 18/18 PASS |

**Parallel-vs-serial:** matched the plan. `{T1,T2}` spawned 6 s apart in one message (true parallel); `{T3,T4}` spawned 7 s apart in one message. The onboarding-retro finding — *implementers spawned one-per-turn though the plan grouped them* — **did not recur**; every independent pair was batched into a single message.

## 4 — Lessons

### What helped
- **Heavy pre-staging + a priming brief per spawn.** The feature shipped with the `pr_brief` table, the `risk_brief` `FEATURE_MODELS` entry, and the `Risk`/`Intent`/`BlastRadius`/`SmartDiff` contracts already present. Each implementer prompt stated this explicitly with `file:line` ("pre-staged, don't re-derive"). Result: T1 91 s and T2 62 s clean first passes (#17, #18).
- **INSIGHTS primed into the prompts landed 0 reviewer Critical/Warning and 0 fix-loop passes.** Every trap the prompts named was applied: private `LINKED_ISSUE_RE` duplicated not widened (arch-review #23 confirmed `adapters.ts` diff empty), rate-limit-off-in-tests → `onRoute` config assertion (`brief-routes.test.ts`), Colima `.it` env, `Badge`-nowrap avoided for risk explanations, `@devdigest/shared` barrel imported as `import type`. This is a direct priming win.
- **Inline `/code-review` conserved budget.** After onboarding's 3 general-purpose finder agents (#7–9) burned the session limit for thin reports (ch 145/93/125), the orchestrator ran the risk-brief code-review inline — zero spawns, same 0-Critical result.

### What was hard
- **External weekly-limit interruptions, not orchestration.** Two implementers died mid-flight: T3 (#19) on its final full-suite run *after* its files had landed, and T5 attempt-1 (#21) early with nothing landed (~351 s wasted). Recovery required a worktree state-check + a fresh T5 spawn (#22, 1592 s).
- **The mandated full `pnpm test` integration gate re-surfaced the known flaky suites** (`reviews-context.it`, `reviews-skills.it`, `context-ac22.it`) and cost a confirmatory re-run (~9 min of the 21-min gate/review gap) to prove flakiness rather than regression.

### Duplicated work
- **T5 executed twice** (#21 died → #22 fresh). Attempt-1 landed nothing, so #22 was a restart, not a re-derivation of landed code — but ~351 s + a re-read of the same `IntentCard`/`BlastPanel`/`OverviewTab` grounding was paid twice.
- Minor: after each limit-death the orchestrator re-derived worktree state via `git status`/`ls` before deciding to re-spawn.

### What was missed
- **Nothing by the reviewers or verifier** (18/18 AC PASS, 0 Critical/Warning). The two architecture Suggestions (`new ContextService(container)` construction; the now-2nd `LINKED_ISSUE_RE` copy) are documented, by-design trade-offs — not misses. No pre-existing `INSIGHTS.md` entry went un-applied (no priming failure this run).

## 5 — Feed-forward brief (next "wire-up a pre-staged PR-overview feature" run)

> **Before planning, grep for the scaffold.** These PR-overview features ship pre-staged and unwired. Run first: `grep -n <feature> server/src/vendor/shared/contracts/platform.ts` (FEATURE_MODELS id), `grep -n pgTable server/src/db/schema/reviews.ts` (cache table), and check `contracts/brief.ts` for building-block types. Plan against what already exists; do **not** touch `FEATURE_MODELS`.
> **Touch-together set (server brief-like feature):** `modules/reviews/<sub>/compute.ts` + `service.ts` + `repository.ts` + `routes.ts` + `prompts/<x>.system.md` + a generated additive migration on the pre-staged table. Mirror `contracts/brief.ts` byte-for-byte to the client copy in the **same** task.
> **Verify cheaply first.** Gate on `pnpm typecheck` + the feature's own `brief-*`/`<x>-*` suites (Colima env) before the full `pnpm test`; the full suite carries known rotating-flaky `.it` suites (`reviews-context`, `reviews-skills`, `context-ac22`) — a red there needs an isolation re-run, not a fix.
> **On a mid-run agent death (limit/crash): check the worktree before re-spawning.** Implementer file writes are idempotent and may have fully landed (T3 did); a blind re-spawn can duplicate or collide. `ls` the target dir + `git status` first, then re-spawn only what didn't land.
> **Run `/code-review` inline, not via finder agents, when budget is tight** — same coverage, no spawn cost.

## 6 — Proposed INSIGHTS (awaiting approval — not yet written)

**Candidate A — repo-root `INSIGHTS.md`**
```
## 2026-07-08 — PR-overview features ship PRE-STAGED (table + FEATURE_MODELS id + contracts) before they are wired

Onboarding and risk_brief both landed as: a DB table (`onboarding`, `pr_brief`),
a `FEATURE_MODELS` entry (`onboarding`, `risk_brief`), and building-block Zod
contracts — all present and UNWIRED before the feature was built. Before planning
a "wire up feature X" task, grep `FEATURE_MODELS` (`vendor/shared/contracts/platform.ts`),
`db/schema/*`, and the relevant `contracts/*.ts` for X first; plan against the scaffold
and do NOT edit the pre-staged `FEATURE_MODELS` entry.
Evidence: `pr_brief` (`db/schema/reviews.ts`), `risk_brief` (`platform.ts` FEATURE_MODELS),
`RiskBrief`/`Risk` (`contracts/brief.ts`) all pre-existed PR #20; same shape as onboarding PR #19.
```

**Candidate B — `server/INSIGHTS.md`**
```
## 2026-07-08 — `ContextService` is not on the DI container — construct it (`new ContextService(container)`)

Reading Project-Context specs from another module uses `new ContextService(container)`
(the `context/routes.ts` precedent), not a container getter — `ContextService` is a public
class, its `ContextRepository` stays encapsulated, and `discover()`/`preview()` are already
realpath-contained clone reads. Brief compute is the 2nd such call site. A 3rd consumer is the
trigger to promote it to a lazy `container.context` getter (mirroring `repoIntel`), not a 3rd
ad-hoc construction.
Evidence: `server/src/modules/reviews/brief/compute.ts` (`gatherSpecs`), `context/routes.ts`.
```

**Candidate C — orchestration lesson (does NOT fit module `INSIGHTS.md`; documented here only)**
On a mid-run subagent death from an API/usage limit, the worktree may hold fully-landed idempotent
writes (T3 #19 landed all files; T5-attempt-1 #21 landed nothing). Always `ls`/`git status` the target
before re-spawning. This is a `/run-plan` orchestration habit, not a per-module code fact — kept in this
retro, not proposed for any `INSIGHTS.md`.
