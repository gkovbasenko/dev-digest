# reviewer-core — map for Claude

`@devdigest/reviewer-core` — pure review engine. No DB, no GitHub, no FS. The only side effect is an injected `LLMProvider`.

## Stack

- TypeScript 5.7 only — **no JS emit**, consumed as `.ts` source
- Zod 3.24, openai 4.77
- vitest 2.1 (passWithNoTests)
- npm (not pnpm)

## Commands

- `npm test` — vitest
- `npm run typecheck`
- `npm run build` — **type-check only** (`tsc --noEmit`); does not emit

## Map

- `src/index.ts` — public API (consumed by server + agent-runner via tsconfig alias)
- `src/prompt.ts` — `assemblePrompt`
- `src/llm/` — structured output, provider interface
- `src/grounding.ts` — citation gate (the boundary that drops uncited findings)
- `src/review/` — `run`, `reduce`
- `src/output/to-review.ts` — CI payload helpers

## Non-default conventions

- This package emits no JavaScript. Consumers import `.ts` directly via tsx/vitest/Next.
- All side effects must flow through the injected `LLMProvider` — keep this package pure.
- Public surface = whatever `src/index.ts` re-exports. Treat changes as breaking for server + agent-runner.

## Gotchas

- Uses npm, not pnpm — lockfile is `package-lock.json`.
- Adding a runtime dep here means the server (which consumes source) must also resolve it.
- The grounding gate is load-bearing: dropping uncited findings is the correctness boundary, don't bypass it.

## Do not touch

- Don't add a JS build emit. `build` stays `tsc --noEmit`.
- Don't introduce DB, network, or FS side effects — those belong in the server adapters.
- Don't reshape `src/index.ts` exports without searching server + agent-runner call sites first.

## Docs (read on demand)

- [README.md](./README.md) — pipeline (diff → prompt → LLM → grounding → findings), public API
- [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md) — prompt rules, severity rubric
