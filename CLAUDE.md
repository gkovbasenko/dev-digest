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

## Non-default conventions

- **Not a workspace.** Cross-module wiring is via tsconfig path aliases; each module has its own lockfile. `pnpm-workspace.yaml` files in `client/`/`server/` are not a monorepo setup.
- **Server consumes `reviewer-core` as `.ts` source** via tsx/vitest. No dist.
- **DI container** at `server/src/platform/container.ts` is the only way to reach adapters.
- **Skills live at `.claude/skills/`** and are LAZY-loaded — don't inline their content here.

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
