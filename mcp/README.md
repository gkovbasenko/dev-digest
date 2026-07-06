# @devdigest/mcp

Local **stdio** MCP server for Claude Code — a thin HTTP client over the existing dev-digest
Fastify API (`http://localhost:3001`). No business logic: every tool calls an existing HTTP
endpoint. See [CLAUDE.md](./CLAUDE.md) for the module map and [../docs/plans/mcp-server.md](../docs/plans/mcp-server.md)
for the full design.

## Prerequisites

- `@devdigest/api` running locally (`cd server && pnpm dev`, default `http://localhost:3001`).
- Node ≥ 22.

## Install

```bash
cd mcp
npm install
```

## Tools

5 tools, all thin wrappers over the API — no business logic lives here:

- `list_agents` — compact list of configured review agents
- `run_review` — resolve repo/PR/agent → trigger a review → wait for it → return findings
  (graceful timeout fallback if the run is still in progress)
- `get_findings` — aggregated open findings for a PR
- `get_conventions` — accepted/candidate coding conventions for a repo
- `get_blast_radius` — **stub** for now (`{ status: 'not_implemented', hint }`)

## Registering with Claude Code

Precondition: `@devdigest/api` must be running locally (`cd server && pnpm dev`, default
`http://localhost:3001`) — the MCP server is a thin HTTP client and has nothing to talk to
otherwise.

The server runs from source via `tsx` (repo convention — no build/dist step), so it's launched
with `npx tsx <absolute-path-to>/mcp/src/index.ts`. Use an **absolute path**, since `claude mcp
add`/`.mcp.json` may be resolved from a different working directory than this repo.

### Option A — `claude mcp add` CLI

```bash
claude mcp add dev-digest \
  --env DEVDIGEST_API_URL=http://localhost:3001 \
  -- npx -y tsx /Users/gkovbasenko/app/ai/dev-digest/mcp/src/index.ts
```

### Option B — project `.mcp.json`

```json
{
  "mcpServers": {
    "dev-digest": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/gkovbasenko/app/ai/dev-digest/mcp/src/index.ts"],
      "env": {
        "DEVDIGEST_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

Claude Desktop is intentionally not supported — this MVP targets Claude Code's stdio transport
only (see `CLAUDE.md`).

## Development

```bash
npm run dev         # tsx src/index.ts
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the running `@devdigest/api` server |
| `WAIT_TIMEOUT_MS` | `120000` | Max time `run_review` waits for a triggered run to finish |
| `HTTP_TIMEOUT_MS` | `15000` | Per-HTTP-call timeout against the API |
