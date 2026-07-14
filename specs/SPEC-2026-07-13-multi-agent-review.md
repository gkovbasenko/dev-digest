# Spec: Multi-Agent Review  |  Spec ID: SPEC-2026-07-13-multi-agent-review  |  Status: approved

Module: cross-cutting (server + client + shared)

## Problem & why

A real PR is heterogeneous — it mixes security, performance, and domain-logic
concerns at once. One agent = one focus, so a single reviewer always misses one
axis. Running several specialised agents in parallel closes a PR from every side
in a single pass. But naively running N agents creates three problems this spec
solves:

1. **Redundant findings erode trust.** Three agents independently flag the same
   obvious bug; the user reads three identical findings and stops trusting the
   tool. We need cross-agent grouping so a location is shown once, with each
   agent's stance.
2. **No attribution.** "Which agent found this" is the raw material for the
   future Per-Agent Stats feature (Road Star / ДЗ). Attribution must live in the
   data even before that feature ships.
3. **No live window.** Running several agents without live status is minutes of
   staring at a spinner. Live per-agent status shows who finished, who is
   thinking, who errored.

The building blocks are largely pre-staged in the codebase (see **Inputs
(provenance)**): the multi-agent execution loop, the SSE run-event stream, the
`observability.ts` contracts (`MultiAgentRun`, `AgentColumn`, `Conflict`,
`AgentStats`), and the `multi_agent_runs` table all exist but are unwired. This
spec wires them and builds the missing picker, grouping algorithm, page, and the
per-agent estimate.

## Goals / Non-goals

**Goals**
- Let a user pick a subset of agents to fan out on a PR from (a) a "Pick agents
  to run" dropdown on the PR page and (b) a dedicated **Configure run** page with
  per-agent time/cost estimates and a pre-run summary estimate.
- Execute the selected agents with **bounded-concurrency parallelism** (limit
  N=3–4), each in its own context with per-agent failure isolation.
- Group the separate `agent_runs` under one **multi-agent run** record and
  return it as a single result.
- Compute **cross-agent conflicts** (same file:line where agents disagree,
  including "did not flag") from persisted findings and render a **Where agents
  disagree** block with a "Show only conflicts" toggle.
- Provide a **Multi-Agent Review page** with two result modes: **Columns** (one
  live column per agent with status + cost, "View trace" link) and
  **Tabs + detail** (per-agent tabs; finding detail with confidence, suggested
  fix, and action buttons).
- Surface per-agent avg cost/latency (`GET /agents/:id/stats`, minimal subset)
  to drive the Configure-run estimate.
- Preserve per-finding agent attribution in the data.

**Non-goals**
- **Per-Agent Stats / Agent Performance page** — only the minimal
  `avg_cost_usd` / `avg_latency_ms` subset needed by the picker ships here. The
  full `AgentStats` page (accept-rate, trend charts) is a separate spec.
- **Memory / "Learn"** — no memory module is built. "Learn" ships as a disabled
  "coming soon" hook only.
- **"Reply to author"** — ships as a disabled hook only (no GitHub comment
  publication).
- **Compose Review drawer** — the finding-curation-before-publish surface is a
  separate feature, out of scope here.
- **Trace enrichment** — surfacing grounding-gate-rejected findings and
  per-call cost inside `RunTraceDrawer` is NOT in scope; the current trace is
  reused as-is (see Assumptions).
- Changing the reviewer-core review pipeline, prompt assembly, or grounding gate.

## Assumptions & dependencies

- **Reused, verified present:** `POST /pulls/:id/review`
  (`server/src/modules/reviews/routes.ts:34`), the multi-agent executor with
  per-agent failure isolation (`run-executor.ts:58,139-166`), the SSE stream +
  replay buffer (`server/src/platform/sse.ts:63`, `routes.ts:55`), the client
  SSE consumer `useRunEvents` (`client/src/lib/hooks/reviews.ts:168`),
  `LiveLogStream` (`client/src/vendor/ui/LiveLogStream.tsx`), `RunTraceDrawer`
  (`.../_components/RunTraceDrawer`), `Finding.confidence` +
  `Finding.suggestion` (`contracts/findings.ts:56-57`), the finding
  `accept`/`dismiss` actions and "Turn into eval case"
  (`POST /findings/:findingId/eval-case`, `eval/routes.ts:50`;
  `useCreateEvalCaseFromFinding`).
- **Pre-staged contracts (present, byte-for-byte mirrored, zero consumers):**
  `MultiAgentRun`, `AgentColumn`, `Conflict`, `ConflictTake`, `AgentStats` in
  `server/src/vendor/shared/contracts/observability.ts` (and its identical
  client mirror). Building against these; do NOT redesign their shapes.
- **Pre-staged, incomplete:** the `multi_agent_runs` table exists
  (`server/src/db/schema/runs.ts:59`) but has **no link column** to
  `agent_runs`; it is never read or written. A migration is required (see
  Rollout).
- **Disproved reuse claims** (surfaced during grounding — do not plan against
  them):
  - The route contract `RunRequest` (`platform.ts:291`) accepts only
    `{agentId}` **or** `{all}` — there is **no** way to pass a chosen *subset*.
    A contract change is required.
  - Execution is **sequential** (`run-executor.ts:139` `for` loop awaiting each
    agent), not parallel. Bounded-concurrency parallelism is a build task.
  - There is **no** finding-match / cross-agent grouping rule anywhere in the
    codebase — only the `Conflict` contract's doc-comment describes the intent.
    The matching algorithm is a build task.
  - `RunTraceDrawer` does **not** render grounding-gate-rejected findings or
    per-call cost (`RunStats.grounding` is a coarse string; `ToolCall` has no
    cost field). The mockup/brief overstated the trace; it is reused as-is.
  - The `/multi-agent`, `/agent-performance`, `/memory` routes are **phantom**:
    `app-shell/helpers.ts` has `activeKeyFor` branches for them but no page and
    no `NAV` entry (`vendor/ui/nav.ts`).
- Cost is not persisted per run — it is derived at read time from
  `estimateCost(model, tokensIn, tokensOut)`
  (`server/src/adapters/llm/pricing.ts`), which returns `null` for unknown
  models. Any cost this spec displays inherits this "null when unpriced" rule.
- No new `FEATURE_MODELS` entry is needed: multi-agent review runs
  user-defined agents (each with its own provider/model), not a platform
  feature model.

## User stories

- As a reviewer, I want to pick which specialised agents fan out on a PR so I
  cover exactly the axes I care about, so that I get a security + performance +
  domain read in one pass.
- As a reviewer, I want a pre-run estimate of time and cost so I decide
  consciously before spending money on N LLM calls.
- As a reviewer, I want redundant findings across agents collapsed to one
  location with each agent's stance, so that I trust the tool instead of reading
  the same bug three times.
- As a reviewer, I want live per-agent status (finished / thinking / errored)
  and a trace link per agent, so that I am not staring at an opaque spinner.
- As a reviewer, I want each finding attributed to the agent that produced it,
  so that Per-Agent Stats can later be built on real attribution data.

## Acceptance criteria (EARS)

### A. Agent picker & run trigger (BUILD)

- **AC-1** — WHEN the user opens the "Pick agents to run" dropdown on the PR
  page, the system shall render one selectable checkbox per enabled agent (from
  `useAgents()`), a "Run multi-agent review (N)" action where N = the count of
  checked agents, and shall disable that action while N = 0.
  - Verify: component test on the new picker — render with 3 agents, assert 3
    checkboxes + a disabled run button at N=0, enabled reading "(2)" after
    checking two.
- **AC-2** — WHEN the user confirms the picker with a set of checked agents, the
  system shall issue exactly one `POST /pulls/:id/multi-agent-run` with the
  selected `agentIds`, and shall NOT fall back to the legacy single-agent /
  all-agents `POST /pulls/:id/review` path.
  - Verify: mocked-fetch component test asserts one call to the multi-agent
    endpoint with the checked ids as body `{ agentIds: [...] }`.
- **AC-3** — The system shall extend the run-trigger contract with a subset
  form: `MultiAgentRunRequest = { agentIds: string[] (min 1) }`, added to
  `observability.ts` (or `platform.ts`) and mirrored byte-for-byte into the
  client vendored copy.
  - Verify: `diff server/src/vendor/shared/contracts/<file>.ts
    client/src/vendor/shared/contracts/<file>.ts` is empty; server `tsc` +
    client `tsc` both pass.
- **AC-4** — IF the request body contains zero agent ids, an id that is not an
  agent in the workspace, or a disabled agent, THEN the system shall reject with
  a 400 `ValidationError` and shall create no `agent_runs`, no `reviews`, and no
  `multi_agent_runs` row.
  - Verify: integration test (`*.it.test.ts`) posts each invalid body, asserts
    400 and unchanged row counts in the three tables.

### B. Configure-run page & estimate (BUILD)

- **AC-5** — The system shall add a **Configure run** page reachable at
  `/multi-agent` (new route + `NAV` entry keyed `multi-agent`, wiring the
  existing phantom `activeKeyFor` branch), with a PR selector (step 1) and an
  agent checklist (step 2).
  - Verify: navigating to `/multi-agent` renders the page (not a 404); the
    sidebar highlights the "Multi-Agent Review" item.
- **AC-6** — WHILE no pull request is selected, the system shall render the
  empty state ("Pick a pull request first"), disable the agent checklist, and
  keep the "Run multi-agent review" action non-functional.
  - Verify: component test — initial render shows the empty-state card and a
    non-actionable run button.
- **AC-7** — WHERE an agent has at least one prior run, the system shall display
  that agent's `avg_latency_ms` and `avg_cost_usd` (from
  `GET /agents/:id/stats`) on its checklist row (e.g. "~6s · $0.05").
  - Verify: component test with a stubbed `useAgentStats` returning
    `{ avg_latency_ms: 6000, avg_cost_usd: 0.05 }` asserts the row text.
- **AC-8** — IF an agent has no prior runs (its `avg_*` are null), THEN the
  system shall render "— · no data" for that agent instead of a fabricated
  number.
  - Verify: component test with stubbed null stats asserts the "no data" label,
    no "$" and no "s" number rendered.
- **AC-9** — WHEN one or more agents are selected, the system shall show a
  pre-run summary estimate computed as: total cost = **sum** of the selected
  agents' `avg_cost_usd`, wall-clock = **max** of their `avg_latency_ms`
  (parallel fan-out), over only the agents that have history.
  - Verify: unit test on the estimate helper — inputs {A: 4s/$0.05, B: 8.2s/
    $0.06, C: no-data} → output "≈ 8.2s · $0.11 · parallel fan-out".
- **AC-10** — IF at least one selected agent has no history, THEN the summary
  estimate shall carry an explicit incompleteness marker (e.g. "estimate
  excludes N agent(s) with no history") rather than silently omitting them.
  - Verify: component test asserts the marker text appears when a no-data agent
    is selected.
- **AC-11** — The system shall expose `GET /agents/:id/stats` returning the
  minimal `AgentStats` subset needed here (`agent_id`, `agent_name`, `runs`,
  `avg_cost_usd`, `avg_latency_ms`), computed by aggregating that agent's
  `agent_runs` (avg cost via `estimateCost` over `tokens_in`/`tokens_out`,
  avg latency via `duration_ms`), and `null` for the averages when `runs = 0`.
  - Verify: integration test seeds two done runs for an agent, asserts the
    endpoint returns the correct averages; a zero-run agent returns null
    averages.

### C. Grouping into a multi-agent run (BUILD)

- **AC-12** — WHEN a multi-agent run is triggered, the system shall create one
  `multi_agent_runs` row and link every spawned `agent_runs` row to it via a new
  `multi_agent_run_id` column (nullable FK, `ON DELETE set null`), added by a
  generated migration.
  - Verify: integration test triggers a 3-agent run, asserts one
    `multi_agent_runs` row and three `agent_runs` rows all carrying its id.
- **AC-13** — The system shall expose `GET /pulls/:id/multi-agent` returning the
  **latest** `multi_agent_runs` for the PR shaped as the pre-staged
  `MultiAgentRun` contract (`columns` + `conflicts` + `total_duration_ms` +
  `total_cost_usd` + `agent_count`), or a documented empty/absent response when
  the PR has never had a multi-agent run.
  - Verify: integration test asserts the response validates against
    `MultiAgentRun`; a PR with no group returns the agreed empty shape.
- **AC-14** — WHERE more than one multi-agent run exists for a PR (re-run or a
  concurrent second set), the system shall create a new group each time and
  never mutate a prior group; `GET /pulls/:id/multi-agent` shall return the
  most-recent group by `ran_at`.
  - Verify: integration test triggers two groups, asserts two
    `multi_agent_runs` rows and that the read returns the newer one's id.
- **AC-15** — The system shall allow a second multi-agent run to be triggered on
  a PR while a prior one is still running (concurrent groups permitted), each
  group tracking its own `agent_runs`.
  - Verify: integration test triggers group B before group A's runs complete;
    asserts both groups exist with disjoint `agent_runs` and neither is aborted.

### D. Bounded-concurrency parallel execution (BUILD — modifies executor)

- **AC-16** — WHEN a multi-agent run executes, the system shall run the selected
  agents with a concurrency limit of N (configurable, default 3–4) — starting up
  to N agents at once and starting the next as each finishes — rather than
  strictly sequentially.
  - Verify: unit test on the executor with instrumented agent stubs asserts that
    at no point are more than N in-flight, and that with M > N agents the later
    agents start only after earlier ones resolve.
- **AC-17** — IF one agent's run fails (LLM error, cancel, timeout), THEN the
  system shall isolate that failure: the other agents' runs shall complete and
  persist normally, and the failed run shall be recorded with
  `status='failed'` and its error text (preserving the existing
  `run-executor.ts:157-165` isolation behaviour under the new concurrency model).
  - Verify: unit test — one stub throws; assert the others produce persisted
    reviews and the failing run row has `status='failed'` + error.
- **AC-18** — WHILE agents run, each agent's `agent_runs.id` (runId) shall be
  returned in the trigger response immediately (before completion) so the client
  can subscribe to `/runs/:runId/events` per column, preserving the existing
  fire-and-forget pattern (`service.ts:134-157`).
  - Verify: integration test asserts the trigger response contains one
    `run_id` per selected agent within the request, before reviews are
    persisted.

### E. Cross-agent conflict grouping (BUILD)

- **AC-19** — The system shall compute conflicts from the group's persisted
  findings using a deterministic match rule: two findings match when they cite
  the **same file** AND their `[start_line, end_line]` ranges **intersect** AND
  they are judged the same underlying issue (title/rationale similarity above a
  fixed threshold); a matched location becomes one `Conflict` with one
  `ConflictTake` per agent.
  - Verify: unit test on the matcher — two agents flag `ratelimit.ts:52` with
    overlapping ranges and similar titles → one `Conflict` with two takes; two
    findings in different files → two separate entries (no conflict).
- **AC-20** — WHERE an agent that successfully reviewed did not flag a
  contended location, the system shall include a `ConflictTake` for that agent
  with `verdict='ignored'` ("did not flag"); WHERE agents flagged it with
  divergent severities, each take shall carry that agent's severity.
  - Verify: unit test — 3 done agents, 1 flags CRITICAL, 2 do not → one Conflict
    with takes [CRITICAL, ignored, ignored].
- **AC-21** — The `Conflict` computation shall include **only** agents whose run
  `status='done'`; a `failed`/`cancelled` agent shall NOT appear as a
  `ConflictTake` (neither as "ignored" nor otherwise) in any conflict.
  - Verify: unit test — a failed agent is absent from every `Conflict.takes`.
- **AC-22** — WHERE no location is contended (all agents agree or only one
  reviewed), `GET /pulls/:id/multi-agent` shall return `conflicts: []` and the
  UI shall render an empty "Where agents disagree" state, not an error.
  - Verify: unit test asserts `[]`; component test renders the empty state.

### F. Multi-Agent Review results page — Columns & Tabs (BUILD)

- **AC-23** — The system shall render a **Columns** mode with one column per
  selected agent, each column header showing the agent name, live status, score,
  duration, and cost (`AgentColumn.cost_usd`, `null`-safe), and a **View trace**
  link.
  - Verify: component test renders 4 `AgentColumn`s → asserts 4 headers with
    status + a "View trace" affordance each.
- **AC-24** — WHILE an agent's run is in progress, its column header shall show a
  live "running" status driven by the existing SSE stream (`useRunEvents`), and
  WHEN the run reaches `done`/`failed`, the header shall switch to that terminal
  status without a full page reload.
  - Verify: component test drives a fake event stream from running→done and
    asserts the header status text changes.
- **AC-25** — WHEN the user clicks "View trace" on a column, the system shall
  open the existing `RunTraceDrawer` for that column's `run_id` (reused as-is —
  no grounding-rejected-findings or per-call-cost additions).
  - Verify: component test asserts clicking "View trace" sets the `?trace=<runId>`
    param / mounts the drawer with that runId.
- **AC-26** — The system shall render a **Tabs + detail** mode with one tab per
  agent (persona + finding count); selecting a finding shall show its detail with
  `confidence`, `suggestion` (suggested fix), and the action row.
  - Verify: component test switches to Tabs mode, selects a finding, asserts
    confidence + suggestion + action buttons render.
- **AC-27** — The system shall provide a **Columns / Tabs** toggle that switches
  result modes for the same multi-agent run without re-triggering the run.
  - Verify: component test toggles modes and asserts no new trigger request is
    issued.

### G. Where-agents-disagree UI (BUILD)

- **AC-28** — The system shall render a **Where agents disagree** block listing
  each `Conflict` as one row per location (`file:line` + title) with a cell per
  agent showing that agent's take (its severity, or "did not flag" for
  `verdict='ignored'`) and the take's note.
  - Verify: component test renders a `Conflict` with 3 takes → asserts 3 cells,
    one reading "did not flag".
- **AC-29** — WHEN the user enables the "Show only conflicts" toggle, the system
  shall filter the list to locations where at least one agent flagged and at
  least one did not (or severities diverge), hiding unanimous locations.
  - Verify: component test with a mix asserts unanimous rows disappear when the
    toggle is on.
- **AC-30** — WHERE an agent's run `status` is `failed`/`cancelled`, the system
  shall present that agent as **errored** in its column header and shall NOT
  place it inside the disagree comparison (consistent with AC-21).
  - Verify: component test with one failed agent asserts an "errored" header and
    that agent absent from the disagree cells.

### H. Finding-detail actions (REUSE + hooks)

- **AC-31** — The system shall wire, in the finding detail, the existing
  **Accept** / **Dismiss** actions and the existing **Turn into eval case**
  action (`POST /findings/:findingId/eval-case` via
  `useCreateEvalCaseFromFinding`), reusing current behaviour.
  - Verify: component test asserts Accept/Dismiss call `useFindingAction` and
    "Turn into eval case" calls the eval-case hook.
- **AC-32** — The system shall render **Learn** and **Reply to author** as
  visible but **disabled** "coming soon" controls that issue no backend call in
  this scope.
  - Verify: component test asserts both controls are disabled and clicking them
    fires no fetch.

### I. Attribution (data)

- **AC-33** — The system shall preserve per-finding agent attribution: every
  persisted finding remains reachable to its producing agent via its review's
  `agent_id`/`run_id` (existing `reviews.agentId`/`runId`), and the
  `AgentColumn`/`ConflictTake` shapes carry `agent_id` so the future Per-Agent
  Stats feature can consume attribution without a schema change.
  - Verify: integration test asserts each finding's review row carries the
    correct `agent_id`, and the `MultiAgentRun` response tags each column/take
    with its `agent_id`.

## Edge cases

- **No agents enabled in the workspace** → picker shows an empty checklist and a
  disabled run action (AC-1); Configure-run summary shows nothing to estimate.
- **Single agent selected** → still creates a `multi_agent_runs` group of one;
  `conflicts: []` (nothing to contend); Columns mode shows one column.
- **All selected agents fail** → group exists, every column shows "errored",
  disagree block is empty, page does not error (AC-22/AC-30).
- **Unpriced model** (`estimateCost` returns null) → per-agent and summary cost
  render as "—"/null-safe, never `$NaN`.
- **Agent has history but only failed runs** → `avg_latency_ms`/`avg_cost_usd`
  computed over done runs only; zero done runs ⇒ null averages ⇒ "no data"
  (AC-8/AC-11).
- **Head SHA moves mid-run** → out of scope for grouping; each `agent_runs`
  already records against the head it ran on (existing `markReviewed` behaviour).
- **Concurrent groups on one PR** → both persist; the read returns the newest by
  `ran_at` (AC-14/AC-15). A tie on `ran_at` is broken by `id` for determinism.
- **Findings on the same file:line but genuinely different issues** (low title
  similarity) → not merged into one conflict; shown separately (AC-19).
- **Re-run while the drawer/columns of a prior group are open** → the open view
  keeps its own `multi_agent_run` id; it is not hijacked by the newer group.

## Non-functional

- **Security (A01/A05 — untrusted input):** agent-produced finding text
  (`title`, `rationale`, `suggestion`) and PR bodies are model/foreign output.
  The conflict matcher and all UI must treat them as **data**: render as
  escaped/markdown-sanitised text, never interpolate into a prompt-as-command or
  `dangerouslySetInnerHTML` without sanitisation. The similarity comparison must
  not `RegExp`-compile raw finding text (ReDoS) — use a token/normalised
  comparison.
- **Security (A01):** `GET /agents/:id/stats`, `GET /pulls/:id/multi-agent`, and
  `POST /pulls/:id/multi-agent-run` must be workspace-scoped via the existing
  `getContext` barrier; an agent id or PR id outside the caller's workspace must
  404, not leak another workspace's runs.
- **Rate/cost:** `POST /pulls/:id/multi-agent-run` must carry the same tight
  per-route rate limit as `POST /pulls/:id/review`
  (`max: 10, timeWindow: 1 minute`) since each call fans out to N paid LLM runs.
  Bounded concurrency (N=3–4) additionally caps simultaneous provider load.
- **Performance:** conflict computation and the stats aggregate are reads over
  already-persisted rows — no new LLM calls. The prior-PRs-style unbounded-query
  footgun (server INSIGHTS) must be avoided: bound the findings scanned to the
  group's runs.
- **a11y:** the Columns/Tabs toggle and "Show only conflicts" switch must be
  keyboard-reachable and labelled; live status changes should be announced
  (aria-live) so a screen-reader user learns when an agent finishes.

## Observability

- Reuse the existing structured single-line JSON logs per run. Add one summary
  log line per multi-agent run at completion: `{ event:
  'multi_agent_run.complete', groupId, prId, agentCount, doneCount, failedCount,
  totalDurationMs, totalCostUsd }` — the signal to watch for fan-out health and
  cost. No new metrics backend.

## Rollout / migration / back-compat

- **Migration (generated, never hand-written):** add `multi_agent_run_id` to
  `agent_runs` (nullable uuid FK → `multi_agent_runs.id`, `ON DELETE set null`)
  via `pnpm db:generate`. The `multi_agent_runs` table itself already exists.
- **Contract mirror (forced by this change):** the new `MultiAgentRunRequest`
  (and any field added to `observability.ts`) must be mirrored **byte-for-byte**
  from `server/src/vendor/shared/contracts/*` to
  `client/src/vendor/shared/contracts/*` — `tsc` does NOT catch a missed mirror
  (repo INSIGHTS 2026-06-29). This is an explicit implementation task, verified
  by `diff`.
- **Back-compat:** the legacy `POST /pulls/:id/review` (`{agentId}`/`{all}`) and
  the single-agent `RunReviewDropdown` path remain functional; the new picker is
  additive. If the picker replaces `RunReviewDropdown` on the PR page, the
  underlying `useRunReview`/`POST /pulls/:id/review` mutation is left intact for
  the "run one / run all" affordances that still use it.
- **Nav wiring:** add the `multi-agent` `NAV` entry so the existing phantom
  `activeKeyFor` branch (`app-shell/helpers.ts:28`) becomes reachable.
- No feature flag required; the feature is inert until an agent set is picked.

## Inputs (provenance)

- Selected agent set → [new: user input from picker].
- Per-agent avg cost/latency → [deterministic: aggregate over `agent_runs` via
  `estimateCost`; no LLM call].
- Agent reviews/findings → [reused: existing `reviewPullRequest` pipeline, one
  LLM call per agent as today].
- Conflicts / columns → [deterministic: computed from persisted findings; not
  stored — per `Conflict` contract doc-comment].
- Live status → [reused: existing SSE `runBus` events].
- Trace → [reused: existing single-document `RunTrace`].

## Untrusted inputs

- **Agent finding text** (`title`, `rationale`, `suggestion`) and **PR body** —
  model/foreign output. Treated as **data, never as instructions**: sanitised
  markdown on render, token-normalised (not regex-compiled) in the similarity
  matcher, never fed back into a prompt as a command. (The review pipeline
  already wraps PR body as untrusted upstream — `run-executor.ts:263`.)

## Decisions (resolved)

- **Execution = bounded-concurrency parallel (N=3–4), not sequential.** Chosen
  over strict parallel to keep wall-clock ≈ max latency (matching the UI's
  "parallel fan-out · 8.2s total") while capping simultaneous provider load to
  avoid rate-limit spikes. Requires converting `run-executor.ts:139` from a
  `for`-await loop to a bounded pool.
- **Learn & Reply to author = disabled "coming soon" hooks; Turn into eval case
  = functional.** The eval-case endpoint/hook already exists; a Memory module
  (Learn) and GitHub comment publication (Reply) are out of scope, so they ship
  as inert controls rather than being cut, to hold their place in the ДЗ.
- **No-history estimate = "— · no data"; summary excludes them with a marker.**
  Chosen over a fabricated pricing-table default so the estimate never implies
  precision it doesn't have; the incompleteness is shown, not hidden.
- **Failed agents excluded from conflicts, shown as "errored" in the header.**
  A crashed agent didn't "not flag" — conflating the two would mislabel a
  failure as an opinion. Only `done` agents enter the disagree comparison.
- **Per-agent stats = minimal `avg_cost`/`avg_latency` subset only.** The full
  `AgentStats` page (accept-rate, trend) is deferred to its own spec; only what
  the picker estimate needs ships here.
- **Grouping shows the latest group; re-runs create new groups; concurrent
  groups allowed.** Simpler than a history switcher and matches how `agent_runs`
  are already append-only; concurrency is permitted so a second set isn't
  blocked behind a slow first set.
