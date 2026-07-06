# @devdigest/mcp

Local **stdio** MCP server for Claude Code — a thin HTTP client over the existing dev-digest
Fastify API (`http://localhost:3001`). No business logic: every tool calls an existing HTTP
endpoint. See [CLAUDE.md](./CLAUDE.md) for the module map and [../docs/plans/mcp-server.md](../docs/plans/mcp-server.md)
for the full design.

> **This server is started separately, on demand — never by the app run scripts.**
> `scripts/dev.sh` brings up Postgres + API + client only; it has no reference to `mcp/`,
> and `mcp/` is not a workspace member. Keep it that way (don't add `mcp` to `dev.sh`).

## Quick start (from zero)

The MCP server is a **thin client** — it's useless until the backend it talks to is running.
Bring the whole thing up from a fresh clone in four steps.

**Prerequisites (once):** `docker`, Node ≥ 22, `pnpm`, `npm`.

### 1. Bring up the backend stack

```bash
cd /Users/gkovbasenko/app/ai/dev-digest
./scripts/dev.sh --no-client        # Postgres → migrate → seed → API on :3001 (no Next.js)
```

Leave that terminal running (the API lives as long as it does). Confirm it's up:

```bash
curl -s http://localhost:3001/agents | head -c 80   # → a JSON array of agents
```

> `--no-client` skips the :3000 web app, which the MCP server doesn't need. For the full
> stack use plain `./scripts/dev.sh`.

### 2. Install MCP deps (once)

```bash
cd /Users/gkovbasenko/app/ai/dev-digest/mcp
npm install
```

### 3. (Optional) Verify it's green

```bash
npm run typecheck && npm test       # 39 tests, no running API needed (fetch is mocked)
```

### 4. Run the server — pick the mode for your task

**A. Interactive testing via MCP Inspector (GUI — best for poking tools by hand):**

```bash
cd /Users/gkovbasenko/app/ai/dev-digest/mcp
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

Opens a local UI listing all 5 tools; call them manually and inspect schemas/responses.

**B. Use it in Claude Code (the real, on-demand path):** register it once (see
[Registering with Claude Code](#registering-with-claude-code) below). Claude Code then spawns
the process **only when you actually use a tool** — this is the "separate, when needed" model.

**C. Direct launch (rarely needed — speaks stdio, waits on stdin):**

```bash
cd /Users/gkovbasenko/app/ai/dev-digest/mcp
npm start                           # = tsx src/index.ts
```

Starts quietly; logs go to **stderr**. It's not HTTP, so `curl` won't talk to it.

## Prerequisites

- `@devdigest/api` running locally (`cd server && pnpm dev`, or `./scripts/dev.sh --no-client`;
  default `http://localhost:3001`).
- Node ≥ 22.

## Install

```bash
cd mcp
npm install
```

## Tools

5 tools, all thin wrappers over the API — no business logic lives here:

- `dev_digest_list_agents` — compact list of configured review agents
- `dev_digest_run_review` — resolve repo/PR/agent → trigger a review → wait for it → return findings
  (graceful timeout fallback if the run is still in progress)
- `dev_digest_get_findings` — aggregated open findings for a PR
- `dev_digest_get_conventions` — accepted/candidate coding conventions for a repo
- `dev_digest_get_blast_radius` — **stub** for now (`{ status: 'not_implemented', hint }`)

## TODO / Known limitations

- [ ] **`dev_digest_get_findings` has no `runId` filter — cannot isolate a single run's output.**
  It aggregates open findings across *all* `kind:'review'` rows on the PR, so when
  `dev_digest_run_review` exceeds `WAIT_TIMEOUT_MS` and returns `{ status: 'running' }`, an
  immediate `get_findings` call returns the **pre-run aggregate** (prior reviews), not the run
  you just triggered — easy to mistake stale findings for fresh ones. Today the only signal a
  run landed is the aggregate changing (verdict/score/finding count). Consider a
  `runId`-scoped fetch or a `dev_digest_get_run_status(runId)` tool.
- [ ] `dev_digest_get_blast_radius` is a stub (`{ status: 'not_implemented' }`) — implement once
  the server exposes the blast-radius endpoint (plan L04).
- [ ] `GET /repos/:id/pulls` does a live GitHub sync per call, making PR-number resolution slow —
  optional server-side lookup endpoint deferred (plan T6).

## Registering with Claude Code

Precondition: `@devdigest/api` must be running locally (`cd server && pnpm dev`, default
`http://localhost:3001`) — the MCP server is a thin HTTP client and has nothing to talk to
otherwise.

The server runs from source via `tsx` (repo convention — no build/dist step), so it's launched
with `npx tsx <path-to>/mcp/src/index.ts`.

### Option A — `claude mcp add` CLI

The CLI can be invoked from any directory, so use an **absolute path** here:

```bash
claude mcp add dev-digest \
  --env DEVDIGEST_API_URL=http://localhost:3001 \
  -- npx -y tsx /Users/gkovbasenko/app/ai/dev-digest/mcp/src/index.ts
```

### Option B — project `.mcp.json`

A project-scoped `.mcp.json` is launched with the repo root as the working directory, so a
**repo-relative path** works and keeps the file portable across contributors (checked into git):

```json
{
  "mcpServers": {
    "dev-digest": {
      "command": "npx",
      "args": ["-y", "tsx", "mcp/src/index.ts"],
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
| `WAIT_TIMEOUT_MS` | `120000` | Max time `dev_digest_run_review` waits for a triggered run to finish |
| `HTTP_TIMEOUT_MS` | `15000` | Per-HTTP-call timeout against the API |
