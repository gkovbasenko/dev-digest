# e2e — map for Claude

`@devdigest/e2e` — deterministic browser end-to-end flows for the web app, driven by Vercel agent-browser (CDP, no LLM).

## Stack

- TypeScript 5.7, tsx
- Vercel agent-browser (no Playwright, no LLM at runtime)
- Hermetic seed data (not a live DB)

## Commands

- `pnpm test` — `tsx run.ts`
- `pnpm e2e:hermetic` — `../scripts/e2e.sh` (boots Postgres + server + client with seed, then runs flows)
- `pnpm typecheck`

## Map

- `specs/*.flow.json` — deterministic JSON specs (01-app-boot, 02-repo-pulls-detail, 03-agents, 04-pr-findings, 05-pr-diff, 06-onboarding, 07-settings)
- `run.ts` — runner that drives agent-browser through specs
- `lib/assert.ts` — assertion helpers
- `agent-browser.json` — agent-browser configuration
- `../scripts/e2e.sh` — hermetic wrapper (used by CI)

## Non-default conventions

- Specs are **pure JSON**, no code branches — every step is declarative.
- No LLM calls or AI in specs — flows are deterministic and key-free.
- Assertions hit **seeded data only**; never depend on live external services.

## Gotchas

- Must run against the hermetic seed via `pnpm e2e:hermetic` (or the CI wrapper). Pointing at a live DB will break determinism.
- agent-browser is CDP-based — failure modes differ from Playwright; check `agent-browser.json` for timeouts.

## Do not touch

- Don't add LLM calls or external network dependencies to specs.
- Don't switch to Playwright — agent-browser is the chosen tool.

## Docs (read on demand)

- [README.md](./README.md) — spec format, seeded data model
- [../TESTING.md](../TESTING.md) — test strategy across all modules
