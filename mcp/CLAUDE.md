# mcp — map for Claude

`@devdigest/mcp` — local **stdio** MCP server for Claude Code. A THIN HTTP client over
the existing Fastify API (`http://localhost:3001`, `@devdigest/api`). No business logic:
every tool calls an existing HTTP endpoint and reshapes the response for token efficiency.

## Stack

- TypeScript 5.7, tsx (run/dev), vitest (test)
- npm (own `package-lock.json`) — **not** pnpm, **not** a workspace member
- `@modelcontextprotocol/sdk` (stdio transport), `zod` (tool input schemas)

## Commands

- `npm run dev` / `npm start` — `tsx src/index.ts`
- `npm run typecheck` — `tsc --noEmit -p tsconfig.json`
- `npm test` — `vitest run`

## Map

- `src/config.ts` — env config: `DEVDIGEST_API_URL`, `WAIT_TIMEOUT_MS`, `HTTP_TIMEOUT_MS`
- `src/log.ts` — logger writing only to **stderr** (stdout is the stdio protocol channel)
- `src/types.ts` — local minimal `*Lite` types (NOT `@devdigest/shared` — see Gotchas)
- `src/api-client.ts` — `fetch` wrapper: base URL, timeout, JSON parse, actionable errors
- `src/resolve.ts` — human-readable id → uuid: `resolveRepo`, `resolvePr`, `resolveAgent`
- `src/tools/tool.ts` — `ToolDef` contract shared by all tools
- `src/tools/*.ts` — the 5 MCP tools: `list_agents`, `run_review`, `get_findings`,
  `get_conventions`, `get_blast_radius` (+ `wait-for-run.ts` polling helper)
- `src/index.ts` — bootstrap: `McpServer` + `StdioServerTransport`, registers the 5 tools
- `test/` — vitest: tool input-schema contracts, resolver edge cases, mocked-fetch happy paths

## Non-default conventions

- **Identifiers are human-readable at the tool boundary, resolved to uuid internally.**
  Tools accept `repo` ('owner/name'), `pr` (number), `agent` (name) — never raw uuids.
- **`run_review` is outcome-oriented**: create run → wait → findings in ONE tool call, with
  a graceful timeout fallback (`WAIT_TIMEOUT_MS`, default 120s) — never a hung call.
- **Errors are structured tool results, not thrown exceptions**, and every error names the
  next useful tool to call ("error leads forward").
- **Transport is stdio only.** No Claude Desktop support in this MVP; see README for the
  Claude Code registration snippet.

## Architecture boundary (read before touching `server/`)

This package sits **outside** `server/`'s onion architecture — it is a separate process and
another HTTP client of the API, exactly like `client/` (Next.js). It touches only the HTTP
layer (`server/src/modules/*/routes.ts`) and **never** the DI container, DB, Drizzle schema,
or adapters directly. Don't import anything from `server/src/` other than reading routes for
grounding — there is no runtime dependency in either direction.

## Gotchas

- **Does NOT import `@devdigest/shared`.** `client/src/vendor/shared/` is already a manual,
  unenforced mirror of `server/src/vendor/shared/` (root `INSIGHTS.md`, 2026-06-29); pulling
  shared in here would create a third manual mirror and couple this package to the server's
  build. Instead `src/types.ts` defines local minimal `*Lite` interfaces for only the fields
  actually read. This is a conscious tradeoff: if the server contract shape changes, `*Lite`
  can silently drift — `tsc` won't catch it. Mitigate via contract-aligned test fixtures.
- **Log to stderr only, never stdout** — stdout is the MCP stdio protocol channel; any stray
  `console.log` corrupts the protocol stream.
- `agents.name` is not unique server-side — `resolveAgent` must handle ambiguity (narrow by
  `enabled:true`; if still ambiguous, return an actionable error listing candidates).
- `GET /repos/:id/pulls` does a live GitHub sync on every call (if a token is configured) —
  resolving a PR number can be slow. Accepted as-is for MVP (see plan's T6, deferred/optional).
- A PR can have multiple `reviews` rows (one per agent run); `get_findings` must aggregate
  open findings (`dismissed_at === null`) across ALL `kind:'review'` rows, not just the latest.

## Do not touch

- Don't import `@devdigest/shared` or any `server/src/` internals — HTTP only.
- Don't touch the server DI container, DB, Drizzle schema, or adapters.
- Don't add a 6th tool or Resources/Prompts without updating the plan — MVP is exactly 5 tools.

## Docs (read on demand)

- [README.md](./README.md) — Claude Code registration snippet, usage
- [../docs/plans/mcp-server.md](../docs/plans/mcp-server.md) — full development plan, grounding, decisions
