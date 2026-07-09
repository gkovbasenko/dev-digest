# dev-digest — map for Claude

Context-injection only. Not documentation. Read linked docs on demand.

## Stack

- Node ≥ 22, TypeScript 5.7
- pnpm ≥ 10 for `server/` and `client/`; npm for `reviewer-core/` and `e2e/`
- Postgres 16 + pgvector (via `docker-compose.yml`)

## Modules

- `server/` — `@devdigest/api` · Fastify 5 + Drizzle + Postgres · port 3001
- `client/` — `@devdigest/web` · Next.js 15 App Router · port 3000
- `reviewer-core/` — `@devdigest/reviewer-core` · pure TS engine, consumed as source
- `e2e/` — `@devdigest/e2e` · agent-browser (CDP, no LLM) flows
- `server/src/vendor/shared` — `@devdigest/shared` · Zod contracts
- `docs/agent-prompts/` — canonical reviewer system prompts

Each module has its own `CLAUDE.md`. Run commands from inside the module dir.

## Commands

Harness evals (skills + subagents + workflow) live in `evals/` — vitest + Claude Agent SDK, on the subscription (no API token). Run from `evals/`:

- `cd evals && pnpm eval` — all quality + workflow evals once
- `pnpm eval:quality` — static SKILL.md gate (frontmatter/structure/links; no model, fast)
- `pnpm eval:skills` · `pnpm eval:agents` · `pnpm eval:workflow` — one tier
- `pnpm vitest run skills/<name>` (or `agents/<name>`) — a single artifact

## Read when — you touch the harness

**Rule:** if you change `.claude/skills/*`, `.claude/agents/*`, or any `CLAUDE.md`, run the matching eval **before committing**. A skill/agent without an eval case under `evals/` has nothing to run — add one via `pnpm eval:scaffold <name>` instead of skipping.

| You changed | Run before commit |
|---|---|
| A skill under `.claude/skills/<name>/` | `cd evals && pnpm vitest run skills/<name>` + `pnpm eval:quality` |
| An agent `.claude/agents/<name>.md` | `pnpm vitest run agents/<name>` |
| Routing / docs wiring in any `CLAUDE.md` | `pnpm eval:workflow` |
| Only SKILL.md frontmatter / structure / links | `pnpm eval:quality` |
| Broad or cross-cutting harness change | `pnpm eval` |

## Non-default conventions

- **Not a workspace.** Cross-module wiring is via tsconfig path aliases; each module has its own lockfile. `pnpm-workspace.yaml` files in `client/`/`server/` are not a monorepo setup.
- **Server consumes `reviewer-core` as `.ts` source** via tsx/vitest. No dist.
- **DI container** at `server/src/platform/container.ts` is the only way to reach adapters.
- **Skills live at `.claude/skills/`** and are LAZY-loaded — don't inline their content here. Exception: `engineering-insights` is always-loaded (imported below) so insight capture is active every session without needing to invoke the skill explicitly.

## Gotchas

- Lockfile manager differs per module (pnpm vs npm). Run pnpm/npm from inside the right module.
- `docs/agent-prompts/*.md` are the human-readable canonical copies; the runtime stores them in DB.

## Do not touch

- Don't convert the repo to pnpm workspaces.
- Don't add a JS build emit to `reviewer-core`.
- Don't add files to `.claude/skills/` without going through the skill workflow.

## Docs (read on demand)

- [README.md](./README.md) — project overview, quick start, architecture diagram
- [ONBOARDING.md](./ONBOARDING.md) — contributor quick-start, end-to-end walkthrough
- [TESTING.md](./TESTING.md) — test strategy (hermetic vs. integration, CI path filters)
- [docs/agent-prompts/README.md](./docs/agent-prompts/README.md) — prompt assembly rules, grounding gate

@INSIGHTS.md
@.claude/skills/engineering-insights/SKILL.md
