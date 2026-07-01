# server — map for Claude

`@devdigest/api` — Fastify API, repo indexing, review orchestration.

## Stack

- Fastify 5.2, Drizzle ORM 0.38, Postgres 16 + pgvector
- TypeScript 5.7, tsx (dev), vitest 2.1
- Zod 3.24 (via `fastify-type-provider-zod`)
- octokit, openai, @anthropic-ai/sdk, @ast-grep/napi

## Commands

- `pnpm dev` — `tsx watch src/server.ts`
- `pnpm test` — vitest (split: hermetic vs `*.it.test.ts` integration)
- `pnpm typecheck`
- `pnpm db:generate` — generate migration from schema diff
- `pnpm db:migrate` — apply migrations
- `pnpm db:seed`

## Map

- `src/server.ts` / `src/app.ts` — Fastify boot + plugin registration
- `src/modules/<domain>/` — plugin per domain (`agents`, `pulls`, `repos`, `reviews`, `repo-intel`, `settings`, `workspace`, `polling`); `_shared/` for cross-module helpers
- `src/adapters/` — LLM, github, git, astgrep, codeindex, depgraph, embedder, auth, secrets, tokenizer
- `src/platform/container.ts` — DI container (the only way to reach adapters)
- `src/db/` — Drizzle schema, generated migrations, `migrate.ts`, `seed.ts`
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts (consumed by client)
- `src/prompts/` — onboarding system prompt

## Non-default conventions

- Integration tests use `*.it.test.ts` suffix (CI splits by path).
- Cross-module access goes through the container — don't import another module's internals.
- Module boundary validates with Zod (request/response schemas via `fastify-type-provider-zod`).
- Migrations are generated, never handwritten — always `pnpm db:generate`.

## Gotchas

- Shared Zod lives under `src/vendor/shared`, not `src/shared`.
- `reviewer-core` is imported as `.ts` source via tsconfig path alias — adding runtime deps there means server must resolve them too.

## Do not touch

- `src/db/migrations/*` — generated artifacts; don't edit by hand.
- Don't bypass the DI container to instantiate adapters directly.

## Skills (invoke when relevant)

- `server-architecture` — Onion layers (route → service → repo → adapter), DI container, module anatomy, forbidden cross-layer patterns

## Docs (read on demand)

- [README.md](./README.md) — request/DI flow, module plugin architecture
- [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md) — prompt rules
- [../TESTING.md](../TESTING.md) — hermetic vs integration split

@INSIGHTS.md
