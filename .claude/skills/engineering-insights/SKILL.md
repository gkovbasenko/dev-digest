---
name: engineering-insights
description: "Capture durable engineering insights to per-module INSIGHTS.md as they emerge during work. Use when a debugging session, code review, or design discussion produces a non-obvious finding worth preserving (gotcha, performance fact, mistake-to-avoid, decision rationale, surprising behavior). Each insight is dated and cites evidence (file:line, commit, error, PR, log)."
---

# engineering-insights

A lightweight memory layer that lives inside the repo. When the conversation surfaces a finding that a future Claude session would benefit from knowing, write it to the relevant module's `INSIGHTS.md`. Per-module `CLAUDE.md` `@import`s its `INSIGHTS.md`, so insights load automatically when Claude works in that module.

## When to capture

Capture **only durable, non-obvious facts**. Apply the line test from CLAUDE.md philosophy: *"if I remove this entry, will future Claude make a mistake?"* If no → don't write it.

Good triggers:

- A bug whose root cause was non-obvious from the code (a hidden invariant, a race, a stale cache, a framework quirk).
- A surprising performance fact (e.g., a query that's slow only with seeded data of size N).
- A decision made in conversation that the code doesn't record (e.g., "we chose A over B because constraint X").
- A failed experiment worth not repeating ("we tried Y, it didn't work because Z").
- A reproducible "gotcha" — config, env var, ordering, side effect.

**Do not** capture:

- Anything already visible from `git log` / `git blame` / the diff.
- Anything the linter or typechecker enforces.
- Anything the README, CLAUDE.md, or ONBOARDING.md already states.
- Volatile facts (current sprint, who's on call, latest counts).
- Generic best practices — those belong in skills.

## When to write (timing)

Capture in the **same turn as the discovery**, before the next task. Don't batch for "end of session" — context and certainty erode fast, and a deferred insight is usually a forgotten one.

Concrete cues to act on the moment they happen:

- You diagnosed a bug whose root cause wasn't visible from the code (hidden invariant, framework quirk, env-dependent behaviour).
- You wrote a workaround (portal, retry, fallback, escape hatch) to dodge an environmental constraint that will bite the next person too.
- You backtracked from a wrong design assumption — yours or the user's prior.
- The user corrected something non-obvious about how the system behaves.
- You just left a `// NOTE:` / `// HACK:` / `// XXX:` comment in code — the *why* often belongs in INSIGHTS, not the comment.
- A test, type, or build fails for a reason that surprised you.
- A code reviewer (human or agent) flags a non-obvious behavior, constraint, or performance characteristic — if the finding is worth fixing, it's usually worth recording so future work doesn't repeat the same mistake.

If the user has to ask *"did you record an insight?"*, the loop failed — treat that as a backstop, not the trigger. If it happens **twice in the same session**, update this skill.

## Where to write

Choose the most specific module:

| Scope of insight | File |
|---|---|
| Server: Fastify, Drizzle, DB, adapters, indexing | `server/INSIGHTS.md` |
| Client: Next.js, RSC, hooks, UI, i18n | `client/INSIGHTS.md` |
| reviewer-core: prompt, grounding, LLM, reduce | `reviewer-core/INSIGHTS.md` |
| e2e: flows, agent-browser, seeded data | `e2e/INSIGHTS.md` |
| Cross-module or repo-wide | `INSIGHTS.md` (repo root) |

If unsure, ask the user where it belongs. Do not write to a module's INSIGHTS.md from inside an unrelated module's conversation.

## Format

Newest entry on top. Each entry uses this shape:

```markdown
## YYYY-MM-DD — <one-line title in imperative or noun phrase>

<2–6 lines explaining the insight in concrete terms. What is true, why it bites, what to do.>

**Evidence:** <file:line | commit SHA | PR # | error text in backticks | log excerpt | conversation date>
```

Rules:

- **Date** is required, in `YYYY-MM-DD` format. Use today's date.
- **Evidence** is required. At least one of: a code path (`src/foo/bar.ts:42`), a commit (`c8c4ec0`), a PR (`#11`), a reproducer command, or a quoted error/log line. "Trust me" is not evidence.
- **No prose narration** of "what we did in the chat" — write the durable fact, not the story.
- Keep each entry under ~8 lines. If it's longer, it's documentation — link instead.

## File template

When creating an `INSIGHTS.md` for the first time, use:

```markdown
# <module> — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## YYYY-MM-DD — <first insight title>

...

**Evidence:** ...
```

## Wiring auto-load

The first time you create an `INSIGHTS.md` in a module, append this line to the bottom of that module's `CLAUDE.md` so it loads with the rest of the map:

```markdown
@INSIGHTS.md
```

For the repo-root `INSIGHTS.md`, append `@INSIGHTS.md` to the bottom of `/CLAUDE.md`.

Do **not** add the `@import` before the file exists — Claude Code treats missing imports as errors. Create the file first, then wire it in.

## Maintenance

- **Size cap: ~200 lines per INSIGHTS.md.** Same context-rot concern as CLAUDE.md — too much noise drowns the signal.
- When the file grows past the cap, prune the oldest entries that are now reflected in code, tests, or CLAUDE.md (because a one-time gotcha became a permanent guardrail). Move pruned entries to `INSIGHTS.archive.md` if they have historical value, otherwise delete.
- If an insight is contradicted by later findings, **replace** it (don't stack contradictions). Note the date of the correction in the new entry.
- Run the line test on the whole file occasionally. Cut anything where "would Claude make a mistake without this?" is no.

## Worked example

A debugging session reveals that `db:migrate` silently no-ops when `DATABASE_URL` is unset in tests because the connection string falls back to `localhost` and the test container uses a random port.

**Right capture (`server/INSIGHTS.md`):**

```markdown
## 2026-06-25 — `db:migrate` silently no-ops in tests without `DATABASE_URL`

`pnpm db:migrate` reads `DATABASE_URL` directly and falls back to `localhost:5432`
when unset. In testcontainer runs the port is random, so the migration connects
to nothing and exits 0. Always export `DATABASE_URL` from the container before
running migrations in test scripts.

**Evidence:** `server/src/db/migrate.ts:14`, reproducer: unset env + run `pnpm db:migrate` against a testcontainer; exits 0 but no tables created.
```

**Wrong capture (don't write):**

```markdown
## 2026-06-25 — Spent two hours debugging migration

We tried running migrations and they didn't work. After looking at it for a while
we realized the env var was wrong. Galina fixed it by exporting DATABASE_URL.
```

The wrong version is a story, not a fact. It cites no path, no error, no actionable rule. A future Claude can't use it.
