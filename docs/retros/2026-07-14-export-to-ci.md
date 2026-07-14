# Retro: Export to CI

## 1 — Run

- **Transcript:** `~/.claude/projects/-Users-gkovbasenko-emdash-worktrees-dev-digest-emdash-export-to-ci-vdx9i/575429e7-5563-4462-9995-3a9a23af6078.jsonl`
- **Feature:** Export to CI. **Plan:** `docs/plans/export-to-ci.plan.md`. **Spec:** `specs/SPEC-2026-07-13-export-to-ci.md`.
- **Branch:** `emdash/export-to-ci-vdx9i` → PR [`gkovbasenko/dev-digest#27`](https://github.com/gkovbasenko/dev-digest/pull/27) (open, all 7 checks green as of this retro).
- **Date:** 2026-07-13/14 (session spans midnight).

## 2 — Metrics

| Metric | Value |
|---|---|
| Agent spawns | 7 — spec-creator ×1, implementation-planner ×1, implementer ×3 (T1/T2/T3), architecture-reviewer ×1, plan-verifier ×1 |
| Execution waves (spawn-level) | 6: spec-creator → planner → T1 → {T2 ∥ T3} → architecture-reviewer → plan-verifier |
| **Spawns that hit an API session-limit failure mid-task** | **3 of 7 (43%)** — T1, T3, plan-verifier. See §4. |
| Full transcript span | 2026-07-13T17:27:52Z → 2026-07-14T04:44:01Z ≈ **11h16m** |
| Spawn-driven phase (spec-creator start → plan-verifier's failure) | 17:36:44 → ~20:08:36 ≈ **2h32m** |
| Solo orchestrator phase (no further spawns) | ~20:08:36 → 04:44:01 ≈ **8h36m** — manual plan-verification, PR creation, two live-usage bug fixes, a CI-infra root-cause investigation. See §4. |
| Assistant turns (orchestrator) | 477 |
| Models | claude-opus-4-8 (agents), claude-sonnet-5 (mid-session default-model switch) |
| Git corpus | 61 files, **+7969 / −18** (spec, plan, server `ci/` module, client CI surfaces, adapter widening, migration `0022`, 2 CI workflow files) |

**⚠️ Per-subagent token spend is UNAVAILABLE** — subagents leave no usage rows in the orchestrator transcript. All numbers below are orchestrator/main-thread spend only. Use per-agent **wall-clock duration** and **report length** (§3) as proxies.

| Orchestrator usage | Tokens |
|---|---|
| input | 864 |
| output | 763,164 |
| cache-read | 125,849,272 |
| cache-creation | 7,059,703 |

| Tool call | Count |
|---|---|
| Bash | 107 |
| Read | 35 |
| Edit | 30 |
| Write | 14 |
| Agent | 7 |
| AskUserQuestion | 1 |
| ScheduleWakeup | 1 |

## 3 — Roster & timeline

| # | Agent | Wave | Duration | Real outcome |
|---|---|---|---|---|
| 1 | spec-creator | 1 | 344.4s | ✅ Completed normally. 512-line spec, 34 ACs, 4 open clarifications with recommended defaults. |
| 2 | implementation-planner | 2 | ~10.9 min (161→acb45a26 notification) | ✅ **Completed normally** — see parser-gap note below; the transcript's raw metadata under-reports this. Produced a 3-task, 2-wave plan under the requester's ≤5-implementer cap. |
| 3 | implementer (T1) | 3 | 391.5s **then failed** | ⚠️ **Session-limit API error** after typecheck passed but before running server tests. Orchestrator inspected the worktree directly, confirmed T1's diffs were complete and correct (byte-identical contract mirrors, additive migration, new adapter methods), and finished verification (server test suite, client typecheck) manually — no second T1 spawn. |
| 4 | implementer (T2) | 4 (∥ T3) | 1254.3s | ✅ Completed normally, zero deviation beyond documented judgment calls. 505/505 server tests, clean typecheck. |
| 5 | implementer (T3) | 4 (∥ T2) | 1241.8s **then failed** | ⚠️ **Session-limit API error** partway through (last text: "Now update `ci.json`..."). Significant work was already on disk (ExportWizard, CiTab subcomponents, hooks). Orchestrator read the plan's remaining scope, wrote the missing root `CiTab` component, the 3-file tab wiring, the `/ci-runs` page + nav entry, and 2 test files directly — no second T3 spawn. |
| 6 | architecture-reviewer | 5 | 223.7s | ✅ Completed normally. GATE PASS, 0 Critical/Warning-blocking findings, 1 non-blocking Warning (Modal duplication). |
| 7 | plan-verifier | 6 | 23.1s **then failed** | ⚠️ **Session-limit API error almost immediately** — essentially no verification work done by the agent. Orchestrator ran the entire plan-verification job manually: server typecheck + the `ci/` test suite (41/41), client typecheck + tests (385 total), both contract-mirror `diff` gates, the `FEATURE_MODELS` no-touch check. |

**Parser-tooling gap found while writing this retro** (relevant to future retros, not just this run): spawn #2's task-notification carried `<task-id>acb45a26e4147cc8b</task-id>` — the **spawned agent's internal ID** (as echoed in the original `Agent` tool's ack: *"agentId: acb45a26e4147cc8b"*) — not the original `tool_use_id` (`toolu_01B94FEHMbfUG3vkdQGQnbw2`) that `parse_run.py` joins on. The parser found no match and recorded `completed: false, source: "ack-only"`, even though the agent fully completed and its report was read and relayed in the conversation (transcript line 161, ts `2026-07-13T19:10:54.066Z`). This refines the existing repo-root `INSIGHTS.md` 2026-07-08 entry on task-notification parsing — see §6.

## 4 — What helped / What was hard / Duplicated / Missed

### What helped

- **Front-loaded, file:line-cited context in spawn prompts visibly prevented rediscovery work.** T2's report shows zero deviation from the plan's stated invariants (DI-only adapters, `getContext()`-only `workspaceId`, enabled-only + marker-stripped skills, no `FEATURE_MODELS` touch) — all of which were named explicitly, with the exact INSIGHTS.md dates, in its spawn prompt. Evidence: T2 report (seq 4), "All other plan items ... are implemented as specified — no further deviations."
- **architecture-reviewer's per-task "explicit acceptance points" paid off.** The review found only **one** non-blocking Warning across the entire server+client surface, and its report shows it checking each pre-declared invariant (onion direction, DI container, contract-mirror byte-parity, secrets-by-name-only) one by one rather than open-ended searching — a direct result of the plan naming these as specific per-task acceptance criteria. Evidence: seq 6 report, "What I checked (and found sound)" section.
- **Orchestrator-level session-limit recovery worked because each failed agent left the worktree in a legible, verifiable state.** T1 and T3 both failed *mid-task*, not at spawn — but because they wrote real files incrementally (not "all or nothing"), the orchestrator could `git status`/`diff` to see exactly how much was done and finish the remainder without redoing completed work.

### What was hard

- **The dominant disruption of this run: 3 of 7 spawns (T1, T3, plan-verifier) failed with `"You've hit your session limit"` API errors partway through their task**, not from any logic or task-scoping problem. In every case the orchestrator diagnosed the on-disk state and completed the remaining scope directly in the main thread rather than re-spawning. This means roughly half of T1+T3's implementation, and **all** of the plan-verification, was ultimately done by the orchestrator, not the specialized agents the plan assigned — a large, unplanned shift in *who* did the work, though not attributable to a planning mistake (it's an external session-budget constraint, and it recovered later in the session per the user's own "limits have been changed" message).
- **Live, human-driven usage found two real bugs that the entire agent chain (T3 implementer → architecture-reviewer → orchestrator's manual plan-verification) missed:** (1) the Export Wizard's "Copy files as a zip" didn't build a zip at all — it downloaded each file individually, flattening `.devdigest/agents/...` paths to bare filenames; (2) a GitHub 403 (missing `contents:write`) on the `open_pr` path surfaced as a raw, unmapped 500 instead of an actionable message. Both passed T3's unit tests (which mock the export mutation, per the plan's own explicit allowance to build/test client work "against mocked hooks in parallel with T2") and both passed architecture review (neither is an architectural boundary violation). Neither was caught until the user actually clicked the button in a live UI.
- **CI-workflow correctness was outside every agent's mandate and was never checked by anyone until the user asked to "rerun actions on PR #27."** The feature's own new tests (`server/test/ci-manifest-roundtrip.test.ts`, `server/src/modules/ci/ci.it.test.ts`) cross-import the sibling `agent-runner` package's real source/build output — a genuinely new CI dependency — but neither `server-unit.yml` nor `server-integration.yml` was updated to install/build it, because no task in the plan or any agent's scope included "does this branch's CI actually go green." Root-causing this took a long, multi-hypothesis investigation (module-resolution theories, `skip-worktree` drift, Node-version mismatch — all dead ends — before landing on the real cause: `agent-runner/node_modules` and `agent-runner/dist/` simply don't exist on a fresh CI checkout) plus a second, unrelated root cause (pnpm 11's `ERR_PNPM_IGNORED_BUILDS` build-script-approval gate, which is a per-machine pnpm state that only `pnpm approve-builds --all` — not `--frozen-lockfile`, not a `package.json`/`pnpm-workspace.yaml` setting I tried first — actually satisfies fresh on every CI runner). This single gap consumed the majority of the 8h36m solo-orchestrator tail.

### Duplicated work

No classic "two agents independently solved the same problem in parallel" duplication occurred — wave 4 (T2 ∥ T3) had fully disjoint file sets as planned, confirmed by `git diff --name-only` showing zero overlap between the two implementers' contributions.

What *did* happen, worth naming distinctly: `server/src/modules/ci/service.ts`+`service.test.ts` and `client/.../ExportWizard/ExportWizard.tsx`+`helpers.ts` were each written once by an implementer, then **patched again by the orchestrator** after the live-usage bugs above surfaced. This isn't wasted parallel duplication — it's a **"verified-in-isolation, wrong-in-integration"** pattern: the first pass was internally consistent and passed every automated check available to it, but didn't survive actual use. The fix cost (2 short, targeted patches) was small, but the *detection* cost (waiting for a human to click through the feature) was the expensive part.

### What was missed

Cross-checked every finding above against `INSIGHTS.md` (repo-root, server, client) — **none of this run's misses were already-documented insights the agents ignored.** The zip bug, the error-mapping bug, and both CI-workflow gaps are genuinely new discoveries from this run, not priming failures. They're proposed as new insights in §6, not framed as "should have known."

## 5 — Feed-forward brief

For the next `spec-creator → implementation-planner → implementer(s) → architecture-reviewer → plan-verifier` run of similar shape (new module + CI/export surface + new cross-package test dependency), hand the next orchestrator this up front:

1. **Session-limit failures mid-task are recoverable without a re-spawn.** If an implementer's background task-notification comes back `status: failed` with a session-limit message, don't assume zero progress — `git status`/`git diff` the worktree first. In this run, T1 and T3 had both done most of their assigned work before failing; the cheapest recovery was reading the plan's remaining scope and finishing it directly, not restarting the agent.
2. **A plan that adds a test cross-importing a sibling package's real source (not through a tsconfig alias resolved at typecheck time, but a genuine `require`/`import` at test-run time) must add a CI-workflow task, not just a code task.** `ci-manifest-roundtrip.test.ts` and `ci.it.test.ts` importing `agent-runner/src/*` / reading `agent-runner/dist/index.js` needed `.github/workflows/server-unit.yml` and `server-integration.yml` to install/build `agent-runner` — this was never in the plan's task list and nobody's mandate covered it. Add "does the CI workflow provision every new cross-package import" as an explicit `plan-verifier` or `architecture-reviewer` check for any plan that touches a package outside `server/`/`client`'s own dependency graph.
3. **A client mutation with a real side effect (a file download, an external API write) needs one live/browser-driven exercise before "done," even with full unit-test coverage.** Both live-usage bugs in this run (the zip that wasn't a zip; the swallowed 403) were on client code paths whose unit tests mocked the mutation hook — correct per the plan's own explicit allowance, but it means nothing in the chain ever actually ran the real button. If a future plan explicitly scopes UI work to mocked-hook testing (a legitimate, cheaper default), pair it with an explicit later step — even a manual one — to click through the feature's main actions once against a live backend before calling it shipped.
4. **If a new package's `pnpm build`/`pnpm test` script needs running in CI, verify it on a truly fresh checkout (`rm -rf node_modules`, ideally `pnpm store prune` too) before trusting a local "it works."** A locally-approved pnpm build-script gate (`pnpm approve-builds`) is a per-machine state that silently masks this exact class of "works on my machine, breaks in CI" gap — see the proposed `agent-runner` insight in §6.

## 6 — Proposed INSIGHTS

Three durable, non-obvious, evidence-backed facts surfaced by this run. None are volatile metrics; all pass the "would a future Claude make a mistake without this?" test.

---

**Target: `agent-runner/insights/INSIGHTS.md`** (under "What Doesn't Work", matching its existing format)

> 2026-07-14 — `pnpm build`/`pnpm test` in `agent-runner` hard-fails with `ERR_PNPM_IGNORED_BUILDS` on a genuinely fresh install (`rm -rf node_modules` or a fresh CI runner) because pnpm 11's isolated linker blocks `esbuild`'s postinstall (a transitive `vitest` dep) until explicitly approved. Unlike `server`/`client` (both `node_linker=hoisted` via `.npmrc`, which sidesteps this), `agent-runner` has no `.npmrc` and hits the gate on any `pnpm run <script>` invocation. The fix is **not** `--frozen-lockfile`, **not** a `package.json#pnpm.onlyBuiltDependencies` entry (tried, silently ignored by this pnpm version), and **not** `pnpm exec <bin>` instead of `pnpm run` (also still triggers it) — only `pnpm approve-builds --all` (run fresh every time; the approval is a per-machine pnpm state, not something a lockfile or package.json can carry) unblocks it. `.github/workflows/server-integration.yml`'s "Build agent-runner bundle" step runs this before `pnpm build`. ref: `agent-runner/package.json` (no `.npmrc`), `.github/workflows/server-integration.yml`.

---

**Target: `server/INSIGHTS.md`**

> 2026-07-14 — A `server/test/*.test.ts` or `server/src/**/*.test.ts` file that cross-imports a **sibling package's real source** (e.g. `../../agent-runner/src/manifest.js`, as `test/ci-manifest-roundtrip.test.ts` does to exercise the real `agent-runner` reader for round-trip parity) creates a CI dependency that `server-unit.yml`/`server-integration.yml`'s existing `pnpm install --frozen-lockfile` (scoped to `server/`) and `reviewer-core`'s `npm ci` step do **not** cover — the sibling package's own `node_modules`/`dist` simply don't exist on a fresh CI checkout, even though the test passes locally (because a human already ran `cd agent-runner && pnpm install`/`pnpm build` by hand at some point). Symptom: `Cannot find module './compose/composer.js'` (a transitive dep unresolved from the sibling package's missing `node_modules`) or an explicit `AppError: ... bundle not built` if the code path reads a built artifact. Any new cross-package import in a server test needs its own install/build CI step (see `server-unit.yml`'s "Install agent-runner deps" / `server-integration.yml`'s "Build agent-runner bundle"), and the workflow's path filters need the sibling package added so the job re-triggers on its changes too. ref: `.github/workflows/server-unit.yml`, `.github/workflows/server-integration.yml`, `server/test/ci-manifest-roundtrip.test.ts`.

---

**Target: repo-root `INSIGHTS.md`** (refines the existing 2026-07-08 entry on parsing background-agent transcripts)

> 2026-07-14 — A background agent's `<task-notification>` `<task-id>` field is not reliably the spawning `tool_use_id` — it can instead be the **spawned agent's own internal agent ID** (the one echoed in the original `Agent` tool-result ack as `"agentId: <id>"`). `.claude/scripts/workflow-retro/parse_run.py` joins notifications to spawns by `tool_use_id` and, when a notification's `<task-id>` is the agent-id form instead, records the spawn as `completed: false, source: "ack-only"` even though the agent fully completed and its report is present in the transcript as a plain-string user message. Anyone reading `parse_run.py`'s output (or writing a future retro) should treat `completed: false` as "the parser found no matching notification," not "the agent didn't finish" — cross-check by searching the transcript for the agent's own distinctive report text before concluding a spawn produced nothing. ref: `.claude/scripts/workflow-retro/parse_run.py`, this session's transcript line 141 (`tool_use_id: toolu_01B94FEHMbfUG3vkdQGQnbw2`) vs line 161 (`<task-id>acb45a26e4147cc8b</task-id>`).

---

I have **not** written any of these to their target files. Awaiting your approval below.
