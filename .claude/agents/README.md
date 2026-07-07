# Agents

Project-level Claude Code subagents, committed to the repo as shared team specialists. Each is a `<name>.md` file in this directory with YAML frontmatter (`name`, `description`, `tools`, `model`) plus a Markdown system prompt. They are discovered automatically — there is no `/agents` wizard anymore; manage them by editing these files.

## Catalog

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| [spec-creator](spec-creator.md) | opus | Read, Grep, Glob, Bash, Write, Edit, Skill, AskUserQuestion, Task | Authors one SDD **specification** with EARS acceptance criteria, grounded in code + designs; interactive, hunts gaps/edge-cases/UX. Writes only under `specs/`; never touches product code. |
| [implementation-planner](implementation-planner.md) | opus | Read, Grep, Glob, Bash, Write, Skill, AskUserQuestion, Task | Turns given requirements into an **Implementation Plan** — verifies/clarifies the requirements, asks multi- vs single-agent mode, decomposes into skill-tagged tasks. Does not author the spec; writes **only** its plan to `docs/plans/`, never code. |
| [implementer](implementer.md) | sonnet | Read, Edit, Write, Bash, Grep, Glob, Skill | Executes **one** scoped plan task (backend or UI), loads the right skill set for its module, self-verifies via typecheck + existing tests, reviews only its own diff. |
| [researcher](researcher.md) | sonnet | Read, Grep, Glob, Bash | Read-only. Finds/verifies information in the codebase; no web access; never edits. |
| [web-researcher](web-researcher.md) | sonnet | WebSearch, WebFetch | Read-only. Finds/verifies information on the internet, with links; no filesystem access. |
| [test-writer](test-writer.md) | sonnet | Read, Edit, Write, Bash, Grep, Glob, Skill | Writes automated tests (backend or UI), one module per run, in parallel; iterates until the suite is green. |
| [architecture-reviewer](architecture-reviewer.md) | sonnet | Read, Grep, Glob, Bash, Skill | Read-only. Reviews architecture — boundaries, dependency direction, coupling — high-signal findings only. |
| [plan-verifier](plan-verifier.md) | sonnet | Read, Grep, Glob, Bash, Skill | Read-only. Verifies a Development Plan's requirements are implemented AND verified; per-requirement PASS/PARTIAL/FAIL. |
| [doc-writer](doc-writer.md) | sonnet | Read, Edit, Write, Bash, Grep, Glob, Skill | Writes documentation grounded in real code — Diátaxis-typed, placed by destination table, Mermaid for diagrams. |

Typical flow: **spec-creator** authors the spec under `specs/` (human-approved) → **researcher** / **web-researcher** gather context (codebase and internet respectively) → **implementation-planner** turns the approved spec into an Implementation Plan (trusting the spec) and persists it to `docs/plans/<slug>.plan.md` so a separate execution chat can read it → several **implementer** (and **test-writer**) agents run in parallel over the plan's disjoint tasks, or one implementer sequentially in single-agent mode → an integration `typecheck + test` gate catches parallel-merge breakage → **architecture-reviewer** (boundaries) and the **`/code-review`** skill (correctness bugs) run alongside test-writing → **plan-verifier** grades requirement coverage against the spec's `AC-N` (final gate; it runs the suite) → **doc-writer** documents it.

The three review axes are distinct and all needed: **architecture-reviewer = boundaries**, **`/code-review` = correctness bugs**, **plan-verifier = requirement coverage**. Don't expect any one of them to catch another's class of problem. `plan-verifier` stays the **final** gate (it grades the real test run, so it needs test-writer's tests and reviewer fixes already in place) — for an early completeness check, use the cheap integration gate, not plan-verifier.

---

## spec-creator

Interactive agent that authors **one SDD specification** — the *what*, upstream of the planner's *how*. It grounds itself in the real code and any designs the user provides, hunts for gaps / uncovered edge-cases / cross-module communication / UX issues, asks clarifying questions via `AskUserQuestion`, and writes the spec flat under `specs/` as `SPEC-<YYYY-MM-DD>-<slug>.md`. Acceptance criteria are written in **EARS** (each `AC-N` gets a `Verify:` line), which `plan-verifier` later grades against. Reads only the `INSIGHTS.md` of modules the feature touches; delegates fan-out lookups to `researcher`. Writes **only** under `specs/` — never product code.

**Based on:**

- **Spec-Driven Development** — pin the *what* (testable requirements) before the *how*, as a reviewed artifact the planner consumes.
  Source: [Addy Osmani — how to write a good spec](https://addyosmani.com/blog/good-spec/) (practitioner, medium-high)
- **EARS acceptance criteria** — the five patterns (ubiquitous / event / state / unwanted / optional) that collapse a fuzzy requirement into one unambiguous, testable statement.
  Source: Alistair Mavin et al., *EARS (Easy Approach to Requirements Syntax)*, Rolls-Royce, 2009 (originating paper, high)
- **Writer ≠ grader / read-only tool scoping** — same principle as the reviewer agents: the spec is the external reference `plan-verifier` grades against, and the agent is scoped to `specs/` so it can't drift into code.

## implementation-planner

Read-only-over-code agent that turns **already-defined requirements** into a structured **Implementation Plan** that `implementer` agents can execute — and **persists that plan to `docs/plans/<slug>.plan.md`** (its one and only write target) so a separate execution chat can read it from disk. It does not author the specification — requirements are its input. It first verifies those requirements against the codebase, clarifies ambiguities via `AskUserQuestion`, recommends better ways to implement, and asks whether to run in multi-agent (parallel) or single-agent (one pass) mode. It knows all five modules, encodes the project's standing constraints (shared-contract mirror, DI container, generated migrations, reviewer-core purity, e2e JSON-only), reads the relevant `INSIGHTS.md` files, and tags every task with the exact skills the implementer must load.

**Based on:**

- **Read-only planning + self-contained specs** — modeled on Claude Code's built-in Plan agent (read-only over code; its **only** write target is its own plan file under `docs/plans/`, so a separate execution chat can read it) and the "self-contained spec" guidance: name the files/interfaces, state what's out of scope, end with an end-to-end verification step.
  Sources: [sub-agents docs](https://code.claude.com/docs/en/sub-agents) (official, high) · [best practices](https://code.claude.com/docs/en/best-practices) (official, high)
- **Non-overlapping, explicitly-scoped task decomposition** — vague task scoping causes duplicated work, so each task gets an objective, an out-of-scope, and disjoint file sets.
  Source: [Anthropic — multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (official, high)
- **Plan template sections & "curse of instructions"** — structured sections (files, testing, boundaries) and specialized per-domain agents instead of one monolithic prompt.
  Source: [Addy Osmani — how to write a good spec](https://addyosmani.com/blog/good-spec/) (practitioner, medium-high)
- **`description` written for delegation** and **model selection by complexity** (opus for decomposition).
  Source: [sub-agents docs](https://code.claude.com/docs/en/sub-agents) (official, high)

## implementer

Executes a single scoped task from the Development Plan and nothing more. Mandatory pre-flight: classify the target module → read that module's `INSIGHTS.md` on-site → load the matching skill set. It writes code inside its declared file set only, self-verifies with typecheck + the module's existing tests, and reviews only its own diff.

**Based on:**

- **Single responsibility + tool scoping** — one task per agent; no `Agent` tool, so it can't spawn nested agents.
  Source: [sub-agents docs](https://code.claude.com/docs/en/sub-agents) (official, high)
- **Reliable skill usage inside an agent** — progressive disclosure; skills triggered by classifying the module and loading the right set via the `Skill` tool before coding.
  Source: [skills docs](https://code.claude.com/docs/en/skills) (official, high)
- **Agent verifies its own work** — give it a check it can run (typecheck + tests) and iterate until green; self-review only its own diff, no separate reviewer pass.
  Sources: [best practices](https://code.claude.com/docs/en/best-practices) (official, high). *Conflicting view worth noting:* some argue an agent should never grade its own code and require a separate validator — [dev.to: validating AI-written code](https://dev.to/teppana88/how-i-validate-quality-when-ai-agents-write-my-code-481c) (practitioner, medium). We adopted the lighter self-verify loop per Anthropic's docs.
- **Parallel work without conflicts via disjoint file sets** — in multi-agent mode the implementation-planner guarantees non-overlapping files; `isolation: worktree` ([worktrees docs](https://code.claude.com/docs/en/worktrees), official, high) was evaluated and **deliberately not used**, so all implementers share one tree and rely on that partitioning.
- **Model selection by complexity** — sonnet for coding.
  Source: [sub-agents docs](https://code.claude.com/docs/en/sub-agents) (official, high)

## researcher

Read-only **codebase** lookup agent — finds files, configs, patterns, and git history in this repo; never edits, and has no web or network access. A project utility, not based on external best-practice research.

## web-researcher

Read-only **internet** lookup agent — finds and verifies facts, docs, library releases, and best practices on the web, with links; no filesystem or terminal access. This is the agent that *gathered* the external sources the other agents are built on.

**Why researcher and web-researcher are split (security):** a single agent holding both filesystem-read and web-fetch forms the "lethal trifecta" — access to private data (files/secrets) + exposure to untrusted content (fetched pages) + an external channel to exfiltrate through (a crafted `WebFetch`/`curl` URL). A prompt-injection payload in a fetched page — which we observed in practice during development — could then read a secret and leak it via a constructed fetch URL. Splitting the capability so **no single agent holds both legs** removes that path structurally: `web-researcher` sees untrusted content but has nothing local to steal; `researcher` can read files but has no way to reach the network. Each also carries explicit injection-defense instructions as defense-in-depth.

## test-writer

Writes automated tests for existing backend or UI code, one module per invocation, in parallel with other test-writers. Pre-flight: classify the module → read its `INSIGHTS.md` → load the matching test skills. Writes tests only (never product code) and iterates until the suite is green. Based on `react-testing-library` / `react-best-practices` / `next-best-practices` (UI) and `fastify-best-practices` / `drizzle-orm-patterns` (backend), plus `zod`, `typescript-expert`, `engineering-insights`.

**Based on:**

- **Behavior-not-implementation testing** — RTL query priority (`getByRole` > semantic > `getByTestId`), `user-event` over `fireEvent`, `query*` only for absence.
  Sources: [React Testing Library docs](https://testing-library.com/docs/react-testing-library/intro/) (official, high) · [Kent C. Dodds — Common mistakes with RTL](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library) (practitioner, high)
- **Backend test stratification** — prefer `fastify.inject()` over supertest; many fast route tests (DB mocked) + fewer real-DB integration tests (`*.it.test.ts`).
  Sources: [pkgpulse — supertest vs fastify.inject 2026](https://www.pkgpulse.com/guides/supertest-vs-fastify-inject-vs-hono-testing-api-2026) (medium) · [Fastify testing docs](https://fastify.dev/docs/latest/Guides/Testing/) (official, high)
- **Meaningful, non-tautological tests** — red-before-green, don't test framework internals, branch coverage on error paths over 100% line coverage; AAA structure.
  Sources: [testdouble — mutation testing keeps the agent on task](https://testdouble.com/insights/keep-your-coding-agent-on-task-with-mutation-testing) (practitioner, high) · [Semaphore — Arrange-Act-Assert](https://semaphore.io/blog/aaa-pattern-test-automation) (medium)

## architecture-reviewer

Read-only architecture reviewer. Reviews dependency direction, boundaries, coupling, and layering against Clean/Hexagonal/DDD and this project's real boundaries (DI container, module isolation, `api.ts`, reviewer-core purity, contract mirror). Reports only high-signal violations, with severity and the specific rule quoted. Based on `architecture-patterns`, `typescript-expert`, `security`, plus per-side boundary skills.

**Based on:**

- **Architecture-level review** — dependency direction / layering / coupling-cohesion vs Clean/Hexagonal/DDD; flag domain importing infrastructure, not style.
  Source: [codeartify — from hexagonal to clean architecture](https://codeartify.substack.com/p/from-hexagonal-to-clean-architecture) (practitioner, medium)
- **Read-only via tool scoping + fresh context** — omit Write/Edit from the allowlist; a fresh context avoids bias toward code just written.
  Source: [sub-agents docs](https://code.claude.com/docs/en/sub-agents) (official, high)
- **High-signal only** — an explicit "Do NOT flag" list (style, lint-catchable, subjective, pre-existing, nitpicks) + flag-then-validate; drop uncertain findings to preserve reviewer trust.
  Source: [Anthropic code-review command](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md) (official, high)
- **Severity-tiered output** — Critical / Warning / Suggestion with `file:line` and the quoted principle.
  Source: [sub-agents docs example](https://code.claude.com/docs/en/sub-agents) (official, high)

## plan-verifier

Read-only requirements-coverage verifier. Given a Development Plan and the code implemented against it, it checks that every requirement was implemented **and** actually verified — running the plan's typecheck/test commands and reading exit codes, never trusting a completion claim. Reports per-requirement PASS/PARTIAL/FAIL with evidence. Focuses on coverage, not code quality (that's the architecture-reviewer's job). Based on `engineering-insights` and `typescript-expert`.

**Based on:**

- **Writer ≠ grader; evidence-anchored** — verification is read-only and proven by concrete evidence (exit codes), not claims.
  Sources: [Claude Code /goal docs](https://code.claude.com/docs/en/goal) (official, high) · [Pebblous — the writer is not the grader](https://blog.pebblous.ai/blog/writer-is-not-the-grader/en/) (practitioner, medium)
- **Requirements-matching ≠ pattern-matching** — needs the plan as an external reference the model can't invent.
  Source: [Aviator — AI code review is still a review](https://www.aviator.co/blog/ai-code-review-is-still-a-review/) (practitioner, medium)
- **Per-requirement PASS/PARTIAL/FAIL + explicit gap list** — file/line-specific evidence vs. expected, and a list of unmet items.
  Sources: [Loadsys — completion proof](https://www.loadsys.com/blog/coding-agent-completion-proof/) (practitioner, medium) · [Addy Osmani — good spec (gap-listing)](https://addyosmani.com/blog/good-spec/) (practitioner, medium-high)

  *Deliberate tension:* the `implementer` grades its own diff (a light self-verify loop, per Anthropic's docs); `plan-verifier` is the **separate** grader for requirement coverage. Both exist on purpose — the self-verify catches obvious breakage cheaply in-loop, the independent verifier catches coverage gaps the writer can't see in its own work.

## doc-writer

Writes and maintains documentation: describing built features, turning implementation plans into docs, or converting given material into documents with diagrams. Classifies each request by Diátaxis type, writes to the correct repo destination via a built-in decision table, grounds content in the actual code, and uses Mermaid for flows/relationships/state. Based on `mermaid-diagram`, `typescript-expert`, plus the module skills for whatever code it documents.

**Based on:**

- **Diátaxis classification** — pick tutorial / how-to / reference / explanation before writing; split a plan across types rather than dumping it as one doc.
  Sources: [Diátaxis](https://diataxis.fr/) (official, high) · [developer-docs-framework (Diátaxis agent skill)](https://github.com/anivar/developer-docs-framework) (community, medium)
- **Doc placement** — README as pointer, depth under `docs/`, numbered ADRs under `docs/adr/` (created on demand).
  Sources: [ADR conventions](https://github.com/joelparkerhenderson/architecture-decision-record) (community, medium-high) · [ReadMe — documentation structure](https://docs.readme.com/main/docs/documentation-structure) (vendor, medium)
- **Mermaid for flows/relationships/state only** — never as decoration; every diagram gets a short narrative.
  Sources: [Mermaid docs](https://mermaid.js.org/intro/syntax-reference.html) (official, high) · [Mintlify — when to use diagrams](https://www.mintlify.com/library/when-and-how-to-use-diagrams) (vendor, medium)
- **Ground docs in real code** — verify against source before writing to avoid hallucinated/stale docs.
  Sources: [DocSync — agentic doc maintenance](https://arxiv.org/pdf/2605.02163) (preprint, medium-high) · [epistemic grounding in agentic coding](https://arxiv.org/pdf/2604.21744) (preprint, medium-high)

---

## Skill routing (shared by implementation-planner + implementer)

| Task target | Skills |
|---|---|
| **backend** (`server/`) | fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, zod, typescript-expert, security, architecture-patterns, engineering-insights |
| **UI** (`client/`) | next-best-practices, react-best-practices, react-testing-library, zod, typescript-expert, security, engineering-insights |
| **reviewer-core/** | typescript-expert, zod, architecture-patterns, engineering-insights |
| **e2e/** | typescript-expert |

Engineering insights reach the agents by **both** paths: the implementation-planner surfaces cross-cutting insights into the plan, and each implementer reads its own module's `INSIGHTS.md` on-site before coding.

---

## Security: write-path guard (`.claude/hooks/guard-write-path.mjs`)

The Write-capable agents (`spec-creator` → `specs/`, `implementation-planner` → `docs/plans/`) enforce their write boundary by **prompt only** — a prompt-injected agent could ignore it. A `PreToolUse` hook on `Write|Edit` (wired in `.claude/settings.json`) is the tool-level backstop: it blocks writes to a **deny-list** of protected paths (`.git/` internals, `~/.ssh`, `~/.aws`, `~/.gnupg`, shell rc files, `.env*`, `.claude/settings*`) and exits non-zero to reject the call. Tested by `guard-write-path.test.mjs` (`node --test .claude/hooks/guard-write-path.test.mjs`).

**Deliberate trade-off — it's a deny-list, not a repo-jail.** Hooks fire for *every* agent's tool calls and can't be scoped per-agent, so a strict "only `specs/` + `docs/plans/`" allow-list would break `implementer` / `doc-writer` / `test-writer`, which legitimately write across the repo. The guard therefore protects the crown jewels (credentials, git, settings) with zero false positives, but does **not** stop a hijacked agent from overwriting an ordinary in-repo source file. The parse path **fails open** on purpose: its stdin comes from the trusted Claude Code harness, not untrusted content, so a malformed payload means a broken harness — not an attack — and failing closed would wedge every write in the session.
