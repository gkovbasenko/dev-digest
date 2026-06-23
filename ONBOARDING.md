# DevDigest — onboarding

A guide for new contributors. Pair with the per-package READMEs (`server/`, `client/`, `reviewer-core/`, `e2e/`) and `TESTING.md`.

## 1. What this thing is

A **local-first AI pull-request reviewer**. You run it on your machine; the only outbound traffic is to GitHub (PR data) and an LLM (OpenAI / Anthropic / OpenRouter). The starter does **one** end-to-end thing: import a PR → run an agent review → see structured findings. Every later course lesson (L01–L08) adds one feature back; the DB schema already has the tables for those lessons — they just sit empty until filled.

## 2. Repo layout

| Folder           | Package                     | What it is                                            | Port |
|------------------|-----------------------------|-------------------------------------------------------|------|
| `server/`        | `@devdigest/api`            | Fastify 5 API · Drizzle · Postgres + pgvector         | 3001 |
| `client/`        | `@devdigest/web`            | Next.js 15 (App Router, React 19) studio              | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core`  | Pure engine — diff → prompt → LLM → grounded findings | —    |
| `e2e/`           | `@devdigest/e2e`            | Deterministic browser flows (agent-browser, no LLM)   | —    |
| `server/src/vendor/shared` | `@devdigest/shared` | Zod contracts shared by every package              | —    |

**Not a monorepo.** Each package has its own `package.json` + lockfile. Cross-package code is wired by **tsconfig path aliases**, not workspace symlinks:

- `@devdigest/shared` → `server/src/vendor/shared/index.ts`
- `@devdigest/reviewer-core` → `reviewer-core/src/index.ts`
- `@devdigest/ui` → `client/src/vendor/ui/index.ts`

The server imports `reviewer-core` **raw TS** (tsx in dev, vitest in tests) — `reviewer-core`'s `build` is just `tsc --noEmit`. That's why `scripts/dev.sh` installs reviewer-core's deps unconditionally — without them the API crashes at boot with `ERR_MODULE_NOT_FOUND`.

**Lockfile gotcha:** `server/` and `client/` use **pnpm**; `reviewer-core/` uses **npm** (`package-lock.json`). `dev.sh` knows this (`npm ci` for reviewer-core). If you `pnpm install` in reviewer-core by habit you'll generate a second lockfile.

## 3. Quick start

```sh
./scripts/dev.sh
```

Bootstraps: Postgres in Docker → `.env` from `.env.example` → install deps → migrate → seed → API `:3001` + web `:3000`. Open `http://localhost:3000`. Flags: `--no-seed` · `--no-client` · `--db-only`.

Add LLM/GitHub keys in `server/.env` or via the Settings UI (UI writes to `~/.devdigest/secrets.json`, mode 0600 — **never** the DB or git).

Prereqs: Node ≥ 22 · pnpm ≥ 10 · Docker.

## 4. End-to-end review flow

```
Add repo
   ↓ git clone into DEVDIGEST_CLONE_DIR/<owner>/<name>  (default ~/.devdigest/workspace)
repo-intel indexes it (T2: symbols + import graph · T3: PageRank + repo-map)
   ↓ "Indexed" badge appears once indexState.status = 'full'
Import PRs (octokit) — diff, commits, body, linked issue
   ↓
Open PR → click Review
   ↓ POST /pulls/:id/review (fire-and-forget; returns run IDs immediately)
ReviewRunExecutor.executeRuns() runs in the background:
   • Pre-work: load diff + intent
       (failure fails ALL queued runs for this PR — no point trying without a diff)
   • Per agent (isolated — one crashing doesn't fail the others):
       reviewer-core.reviewPullRequest()
         → assemblePrompt(diff, system, repoMap, [skills], [memory], [specs], [callers])
         → wrapUntrusted() fences + INJECTION_GUARD appended to system
         → LLMProvider.completeStructured() (JSON-schema constrained)
         → parseWithRepair() loop on bad JSON
         → reduceReviews() (map-reduce path if chunked)
         → groundFindings() drops hallucinated line refs
         → score = scoreFromFindings(survivors)   ← model's self-score is IGNORED
         → verdict is currently passed through from the model unchanged
       runBus.push(event) → SSE /runs/:id/events (live trace in UI)
       Persist review + findings; runBus.complete()
```

**Cancellation:** the engine takes a checkpoint callback that **throws** to abort (`reviewer-core/src/review/run.ts:89`). The server's `POST /runs/:id/cancel` flips a flag the checkpoint reads, so cancellation propagates between LLM calls but **not** across an in-flight one.

On boot, the server **reaps orphan runs**: rows with `status='running'` from a previous process crash are marked failed before Fastify starts accepting requests (`server/src/app.ts` ~lines 80–85). Assumes one API instance per DB.

## 5. Server (`server/`)

### Boot — `src/app.ts`

Plugins register in this order, before any feature module:

1. `fastify-type-provider-zod` (validator + serializer compilers — one Zod schema validates the request **and** serializes the response)
2. DI container attached to the app instance
3. Orphan-run reaper (awaited)
4. `@fastify/helmet`
5. `@fastify/cors` (origin = `config.webOrigin`)
6. `fastify-sse-v2` (for `/runs/:id/events`)
7. Global rate limit 120/min (disabled when `NODE_ENV=test`; SSE + `/health*` exempt; tighter per-route caps on `POST /pulls/:id/review`)
8. `/health` (liveness), `/health/ready` (DB ping → 200/503)
9. **Structured error handler** — Zod failure → 422 · `AppError` → its statusCode · response-serialization fail → 500 with envelope
10. Feature modules from `src/modules/index.ts`
11. DB-handle close on shutdown

**Error envelope:** handlers throw `AppError(code, message, statusCode, details?)`. The handler emits `{ error: { code, message, details? } }`. Client's `ApiError` (in `client/src/lib/api.ts`) unpacks this. Don't `reply.code(500).send(...)` directly; throw `AppError`.

### DI container — `src/platform/container.ts`

Holds `config`, `db`, `secrets`, `auth`, `jobs`, `runBus`. Adapters are **lazy getters** so tests can override before construction:

- `git()` → `SimpleGitClient` over `config.cloneDir`
- `github()` → `OctokitGitHubClient` (key from `SecretsProvider`)
- `llm(id)` → OpenAI / Anthropic / OpenRouter, cached per id
- `embedder()` → `OpenAIEmbedder` — **throws** when `EMBEDDINGS_ENABLED=false` so zero OpenAI calls happen by accident
- `codeIndex()` → `RipgrepCodeIndex` (used when repo-intel is degraded)
- `repoIntel()`, `depgraph()`, `tokenizer()`, `priceBook()`, `agentsRepo`, `reviewRepo`

`ContainerOverrides` swap any port for a mock in integration tests. Secret caches are explicitly invalidated when the Settings UI writes a new key.

### JobRunner — async work queue

`container.jobs` (`src/platform/jobs.ts`) is a DB-backed queue (table in `db/schema/ops.ts`). Used for clone, repo-intel index/resync, polling refresh — anything that shouldn't block a request. Handlers are registered at boot per module (e.g. `RepoService.registerCloneJobHandler`). Soft timeout ~120 s; handlers can self-monitor and mark `partial` before the hard cap.

### Auth — local stub

`LocalNoAuthProvider` (`src/adapters/auth/local.ts`). Single workspace, single system user, no login. Every domain table has `workspace_id` and `created_by` FKs so multi-tenancy can be turned on later, but the starter assumes you trust whoever can reach `:3001`. **Don't expose the API publicly** without putting auth in front of it.

### Adapters — `src/adapters/`

| Adapter | Purpose |
|---------|---------|
| `secrets/local.ts` | `~/.devdigest/secrets.json` (0600) + env fallback; `GITHUB_TOKEN` canonical, `GITHUB_PAT` accepted |
| `auth/local.ts` | No-auth stub for local-only |
| `llm/{openai,anthropic,openrouter}.ts` | Provider implementations of `LLMProvider` |
| `llm/pricing.ts` + `PriceBook` | Live OpenRouter pricing with static fallback table |
| `embedder/openai.ts` | text-embedding-3-small, 1536-dim for pgvector |
| `github/octokit.ts` | Octokit wrapper (list/get PRs, comments, issues) |
| `git/simple-git.ts` + `git/diff-parser.ts` | Clone / fetch / blame / diff under `cloneDir/<owner>/<name>` |
| `codeindex/{ripgrep,extract}.ts` | ripgrep search + ast-grep extractors (Express/Hono/Fastify routes, node-schedule crons) |
| `astgrep/index.ts` | Symbols / refs / imports per language |
| `depgraph/index.ts` | dependency-cruiser → PageRank |
| `tokenizer/index.ts` | js-tiktoken for token budgeting |
| `mocks.ts` | `MockLLMProvider` (caller-supplied fixtures keyed by schema), `MockGitClient`, `MockGitHubClient`, `MockCodeIndex`, `MockEmbedder` — **no network** |

### Feature modules — `src/modules/<name>/{routes,service}.ts`

| Module | Routes | Tables |
|--------|--------|--------|
| **repos** | `GET/POST /repos`, `POST /repos/:id/refresh`, `DELETE /repos/:id` | `repos` |
| **pulls** | `GET /repos/:id/pulls`, `GET /pulls/:id`, `/pulls/:id/comments` | `pullRequests`, `prFiles`, `prCommits` |
| **polling** | `POST /repos/:id/poll` (PR list refresh; **does NOT** trigger reviews) | `pullRequests` |
| **reviews** | `POST /pulls/:id/review`, `GET /runs/:id/events` (SSE), `GET /pulls/:id/reviews`, `POST /findings/:id/{accept,dismiss}`, `POST /runs/:id/cancel` | `agentRuns`, `runTraces`, `reviews`, `findings` |
| **agents** | `GET/POST /agents`, `PUT /agents/:id`, versions, skills | `agents`, `agentVersions`, `agentSkills` |
| **repo-intel** | `GET /repos/:id/index-state`, `POST /repos/:id/resync` | `repoIndexState`, `fileEdges`, `fileFacts`, `fileRank`, `repoMapCache` |
| **settings** | `GET/PUT /settings`, `/settings/secrets-status`, `/settings/test-connection`, `/providers` | `settings` |
| **workspace** | `GET /workspace` | `repos` |

### DB — `src/db/schema/*.ts` + Drizzle

Migrations in `src/db/migrations/*.sql`, not applied on boot (`pnpm db:migrate` is explicit). Migration `0000` enables `pgvector`. Seed (`db:seed`, idempotent): default workspace, system user, demo repo `acme/payments-api`, PR #482, **three built-in agents** (General + Security + Performance) on `openrouter/deepseek-v4-flash`. All domain tables carry `workspace_id` FK; the base repository scopes queries by it.

**Tables wired but empty in the starter** — don't think they're dead code:

- `prIntent`, `prBrief` → L03 (Intent layer / Smart Diff) and L05 (PR Brief card)
- `agentSkills`, `skills`, `skillVersions` → L02 (Skills in the product)
- `multiAgentRuns` → L07 (Multi-agent review)
- `memory` (pgvector, 1536-dim) → L07 (persistent memory)
- `fileRank`, `repoMapCache` → T3 repo-intel (populated when the indexer reaches T3)

### Config & secrets

`src/platform/config.ts` is Zod-validated. Notable env:

- `DATABASE_URL`, `API_PORT`/`WEB_PORT`, `LOG_LEVEL`
- `EMBEDDINGS_ENABLED` (default `false` — keeps OpenAI calls at literally zero)
- `REPO_INTEL_ENABLED` (default `true`; `false` → degrades to ripgrep)
- `DEVDIGEST_CLONE_DIR` (default `~/.devdigest/workspace`)

Secrets are **not** in `AppConfig`; they go through `LocalSecretsProvider`.

### Logging

Pino, level from `LOG_LEVEL` (default `info`, `silent` in tests). `RunLogger` (`src/platform/run-logger.ts`) fans pre-work log lines to every queued run ID via the `runBus`, then flushes to the trace table — that's why a failed pre-work step still leaves a readable trace per agent.

### Repo-intel

Three tiers — T1.1 (best-effort via ripgrep, no index) · T2 (symbols, references, import graph) · T3 (PageRank + repo-map cache + critical paths). Pipeline is a single async job enqueued on repo add (and on `POST /repos/:id/resync` — 202 + poll `/index-state`). Soft budget ~110 s before a hard 120 s cap; `RepoIntel` methods return `[]` or `{degraded: true}` so consumers fall back gracefully. The **Indexed** badge in the UI is `indexState.status === 'full'`.

**Per-agent toggle:** every agent has a `repo_intel: boolean` field. Even with `REPO_INTEL_ENABLED=true` globally, a specific agent can opt out (the Security reviewer might want a leaner prompt). Gate is in `run-executor.ts`, not in `reviewer-core` — the engine just doesn't receive the `repoMap` slot.

## 6. Reviewer-core (`reviewer-core/`)

The portable engine. No DB, no GitHub, no FS, no env reads. Only side effect = the injected `LLMProvider` call.

**Entry:** `reviewPullRequest()` in `src/review/run.ts`.

Pipeline:

1. **`assemblePrompt(parts)`** — `src/prompt.ts`. Slots: `system`, `diff`, `skills[]`, `memory[]`, `specs[]`, `repoMap`, `callers`, `prDescription`, `task`. The starter passes only the first three plus repoMap; the rest are wired but unused (lessons fill them).
2. **`wrapUntrusted(label, content)`** — fences untrusted content as `<untrusted source="…">…</untrusted>` and escapes the closing delimiter. Applied to diff, PR body, specs, callers, repoMap.
3. **`INJECTION_GUARD`** — a fixed paragraph appended to **every** agent's system prompt. Tells the model that anything inside `<untrusted>` is data, and that claims of "demo / intentional / test fixture / do not flag" never descope the review. **Deliberately a static guard, not a denylist** — we don't keyword-scan untrusted text (denylists miss paraphrases and other languages).
4. **`LLMProvider.completeStructured()`** — sends a JSON-schema-constrained request. `parseWithRepair()` (`src/llm/structured.ts`) first tries `JSON.parse`, then `extractJson` (strip fences / balanced braces), then loops with a reprompt up to `maxRetries+1`. OpenRouter path also reads `usage.cost` and forwards `session_id`.
5. **`reduceReviews(partials)`** — when chunked (map-reduce per file), concat findings, worst verdict wins, mean score.
6. **`groundFindings(findings, diff)`** — `src/grounding.ts`. Mechanical gate:
   - finding file must exist in diff
   - whole-file kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) accepted on file presence
   - everything else needs `[start_line, end_line]` to intersect an actual hunk
   - score is **recomputed deterministically** from survivors (CRITICAL −35, WARNING −12, SUGGESTION −3, clamped to [0, 100]). The model's self-reported score is thrown away.

**`verdict` is NOT recomputed.** It's passed through from the model unchanged (`run.ts:208`). This is why the prompt convention "no findings ⇒ approve" is load-bearing — a buggy model can return `request_changes` with zero findings and the UI shows it verbatim. The CI gate (`agents.ciFailOn`, default `critical`) is deterministic from severities, independent of verdict.

Other exports: `toReviewPayload` (CI payload helper, L06), `reduceReviews`, `sliceDiff`, `OpenRouterProvider`. Contracts (`Review`, `Finding`, `Verdict`, etc.) live in `@devdigest/shared`.

Tests stub `LLMProvider` directly — `new MockLLMProvider('openai', { structured: fixture })` — so the engine runs hermetically without OpenRouter.

## 7. Writing agent prompts — `docs/agent-prompts/`

The DB is the runtime source of truth (`agents.system_prompt`); the markdown files under `docs/agent-prompts/` (`general-reviewer.md`, `security-reviewer.md`, `performance-reviewer.md`) are the reviewable copies. **Change both** and version via `PUT /agents/:id` (writes a row in `agent_versions`).

Rules that aren't enforceable by code:

- **Never describe the JSON shape in the prompt.** `response_format: { type: 'json_schema', …, strict: true }` already pins it; describing it in prose causes the model to follow whichever spec it grabs first (we've seen prompts that ask for `### [SEVERITY]` markdown sections produce garbage because they fight the schema).
- **Use the schema vocabulary exactly** — `CRITICAL / WARNING / SUGGESTION`, `request_changes / approve / comment`. Don't introduce a "High/Medium/Low" scale.
- **Every reviewer prompt ends with three blocks:**
  1. **Severity rubric** with an anti-inflation rule (only CRITICAL blocks merge; speculative issues are at most WARNING).
  2. **Verdict mapping** including "no findings ⇒ approve".
  3. **Findings discipline** — no quota, no padding, no duplicates. Zero findings is a good answer.

What the engine does with the output:

| Model returns | Engine does |
|---|---|
| `findings[].severity` | recompute `score`; count CRITICAL as blockers |
| `score` | **ignored** — recomputed from findings |
| `verdict` | passed through to the review record (shown in the UI) |
| `findings[]` | citation-grounded; ungrounded ones dropped |

## 8. Client (`client/`)

App Router; root layout is RSC, everything below is client. Providers wrap React Query (defaults: `retry=1`, `staleTime=30s`, `refetchOnWindowFocus=false`; global 5xx/network → toast, 4xx silent), theme, toast, and the active-repo context.

### Routes

| Route | Page hooks |
|-------|-----------|
| `/` | `useRepos()` → redirect to first repo's `/pulls`, or `/onboarding` |
| `/onboarding` | `useAddRepo()` |
| `/repos/:repoId/pulls` | `usePulls()`, `useRefreshRepo()` |
| `/repos/:repoId/pulls/:number` | `usePullDetail()`, `usePrReviews()`, `usePrActiveRuns()`, `useCancelRun()` |
| `/agents`, `/agents/:id` | `useAgents()`, `useAgent()`, `useUpdateAgent()` |
| `/settings/:section` | `useSettings()`, `useUpdateSettings()`, `useTestConnection()`, `useSecretsStatus()` |

PR detail tabs are URL-driven: `?tab=overview|findings|diff` and `?trace=<runId>` for the run-trace drawer. PR list filters: `?status=needs_review|all|reviewed|stale` + `?sort=`.

### Data layer — `src/lib/`

- `api.ts` → `apiFetch<T>`, `ApiError` (status/code/details envelope), `api.{get,post,put,patch,del}`. Content-Type omitted on empty bodies (Fastify 400s otherwise).
- `hooks/*` — one hook per endpoint family. Polling: active runs poll every **4 s while any is running**, the PR list polls every **60 s**, repo-intel context polls every **1.5 s while reindexing**.

### App shell — `src/components/app-shell/`

Wraps `AppFrame` from `@devdigest/ui`. Global shortcuts via `useGlobalShortcuts()`:

- `⌘/Ctrl+K` — command palette
- `?` — shortcuts help overlay
- `g` then `p` / `a` / `,` → PRs / Agents / Settings (1200 ms `G_NAV_TIMEOUT_MS`)

### Vendored

- `src/vendor/ui` (`@devdigest/ui`) — primitives (Button, Card, Markdown, Skeleton, …), form kit, charts (recharts), shell parts, command palette, nav registry.
- `src/vendor/shared` — **the same Zod contracts the server uses**, via path alias.

### i18n

`next-intl`, single locale `en`, namespaces in `messages/en/<ns>.json`, loaded by `src/i18n/request.ts`. No locale prefix in URLs.

### Conventions

- Pages thin; feature logic in colocated `_components/<Name>/` per route, each with its own `*.test.tsx`.
- `Markdown` primitive = `react-markdown` + `remark-gfm`; used for finding rationales and PR bodies.
- `MermaidDiagram` is lazy-loaded, regex-gated to known diagram keywords, runs with `securityLevel: "strict"`.

## 9. E2E (`e2e/`)

Deterministic flows for **Vercel agent-browser** (Rust + CDP). Each spec is a JSON list of CLI commands; `run.ts` runs them in order against one shared session. Locators are **`--url` / `--text` / `find role|text|label` only** — never the AI `chat` command, so runs are stable and key-free.

Flows assume a **freshly seeded DB with only `acme/payments-api`** — flows 02/04/05 follow the "first repo" redirect. Use the hermetic runner (`./scripts/e2e.sh`) which boots an isolated stack on alt ports (PG 5433, API 3101, web 3100) and tears it down. **Never** `docker compose down -v` to "reset" your dev DB — that drops `devdigest_pgdata` and every imported repo with it.

## 10. Testing & CI

One suite per package, one workflow per suite, each with a path filter so it only runs when its package (or a dep) changes.

| Suite | Workflow | Docker |
|-------|----------|--------|
| client (vitest + jsdom, fetch mocked) | `client.yml` | no |
| server-unit (everything not `*.it.test.ts`) | `server-unit.yml` | no |
| server-integration (`*.it.test.ts`, testcontainers Postgres) | `server-integration.yml` | yes |
| reviewer-core (engine, stubbed LLM) | `reviewer-core.yml` | no |
| e2e-web (hermetic stack + agent-browser) | `e2e-web.yml` | yes |

**Convention:** any DB-backed test (one that imports `test/helpers/pg.ts`) **must** be named `*.it.test.ts`. The unit lane excludes that glob; the integration lane selects only it. Server-integration tests self-skip when Docker is unavailable.

The Windows typecheck matrix used to gate the `@ast-grep/napi` win32 prebuilt; that was dropped in `b7838c8` (Linux-only). If you dev on Windows and `pnpm install` in `server/` fails on `@ast-grep/napi`, that's why — update ast-grep or use WSL.

## 11. Conventions to follow

- **Hermetic by default.** Reach for `src/adapters/mocks.ts` over real network/keys.
- **Schema-first routes.** Zod schemas on `params` / `body` / response; `fastify-type-provider-zod` validates **before** the handler. Never hand-roll `Schema.parse(req.body)` in a handler.
- **One contract per shape.** New API surface = new contract in `server/src/vendor/shared/contracts/`; consumed by both server (route schema) and client (typed hook).
- **No secrets in DB or git.** Always through `SecretsProvider`. Invalidate caches via `container.invalidateSecretCaches()` after a UI write.
- **Repo-intel is best-effort.** Code against the `RepoIntel` facade and handle the `degraded` shape — never reach into the libraries directly.
- **Grounding is mandatory; verdict is not.** Never trust the model's self-reported score or line citation. `verdict` IS trusted today, which is why the prompt rubric is load-bearing.
- **SSE replay-then-live.** `runBus` keeps a per-run buffer + seq counter so a late subscriber gets everything from the start. Don't add ad-hoc websockets.
- **Name tests right.** `*.it.test.ts` for DB-backed tests, plain `*.test.ts` for hermetic.
- **Throw `AppError`, don't `reply.code(500).send(...)`.** The error handler normalises shape.

## 12. Non-obvious / quietly important

- **`reviewer-core` is consumed as raw TS via path alias**, not built. Adding it to a new consumer means adding the alias **and** installing reviewer-core's runtime deps where the consumer runs (this caused the boot-from-zero failure fixed by `66727c8`).
- **`server/pnpm-workspace.yaml` and `client/pnpm-workspace.yaml` are untracked.** That's pnpm v10's per-machine build-script allowlist (`allowBuilds: { esbuild, sharp, … }`) — it gets written when you accept the install prompt. Don't commit them.
- **`server/package.json` is `skip-worktree`.** A local variant is allowed to drift; CI therefore invokes the unit/integration split with `pnpm exec vitest run …` flags rather than relying on `test:unit` / `test:integration` scripts. If you need to change scripts, undo skip-worktree first (`git update-index --no-skip-worktree server/package.json`).
- **Orphan-run reaping is single-instance.** It assumes one API per DB. If you ever run multiple replicas, runs from a healthy peer will be marked failed on the other's boot.
- **`EMBEDDINGS_ENABLED=false` is load-bearing.** The `OpenAIEmbedder` getter **throws** when off — so a code path that accidentally requests an embedder fails loudly instead of quietly hitting OpenAI.
- **`REPO_INTEL_ENABLED=true` is the default**, but degrades silently when the repo isn't indexed yet. The model only ever sees a repo map after the Indexed badge lights up.
- **`POST /pulls/:id/review` is fire-and-forget.** It returns run IDs immediately; the actual work runs in the background and streams over SSE. Don't await it from the UI.
- **Pre-work failure fails ALL queued runs.** If the diff or intent can't be loaded, every run for that PR fails together — intentional (no point trying any agent without a diff).
- **Per-agent runs are isolated.** One agent crashing doesn't fail the others.
- **Score is recomputed from survivors.** UI score, findings list, and the persisted row always agree.
- **Cancellation doesn't interrupt an in-flight LLM call.** The checkpoint fires between calls.
- **`.claude/skills/` is committed** and locked by `skills-lock.json` (8 skills vendored from GitHub repos by content hash). These are dev-time Claude Code skills, **not** product Skills (L02's `skills` table is unrelated).
- **`.emdash.json` is local-only** (emdash worktree config). If you see it on a teammate's machine, it's not project state.
- **`.gitignore` still carries `!agent-runner/dist/`** for a package removed in `0236c5b`. Dead but harmless.

## 13. Common pitfalls — "things that break the first time"

| Symptom | Cause | Fix |
|---------|-------|-----|
| API errors `relation … does not exist` | Migrations weren't applied. The server does **not** migrate on boot. | `cd server && pnpm db:migrate` |
| `ERR_MODULE_NOT_FOUND` from `reviewer-core` on API boot | `reviewer-core/node_modules` missing | `cd reviewer-core && npm ci` (or re-run `./scripts/dev.sh`) |
| `vector` type errors | Migrations ran against a different DB | Make sure you're hitting the Dockerized PG (port 5432) — migration `0000` enables pgvector |
| Port 5432 in use | Another local Postgres | Stop it or change the host port in `docker-compose.yml` |
| Reviews never finish, stuck "running" | Process crashed mid-run; orphan reaper marks them failed on next boot | Reload — they're now `failed`. Re-trigger the review. |
| Verdict says `request_changes` with zero findings | Model didn't follow the verdict rubric (verdict is passed through) | Fix the agent's prompt — verdict semantics block belongs at the end |
| E2E flows 02/04/05 land on the wrong repo | Your dev DB has extra imported repos; the "first repo" redirect doesn't pick `acme/payments-api` | Run `./scripts/e2e.sh` (hermetic stack), don't run e2e against your dev DB |
| `docker compose down -v` ate everything | `-v` deletes `devdigest_pgdata`. Plain `down` just stops the container. | Don't use `-v` for "reset"; if you need a clean DB, use the hermetic e2e stack |
| OpenAI bill creeps up despite "local-first" | `EMBEDDINGS_ENABLED=true` left on; or a code path constructs `embedder()` and catches the throw | Verify env, then grep for new `embedder()` callers |
| Settings change doesn't take effect | Secret cache | UI writes already call `invalidateSecretCaches()`; if you wrote to `~/.devdigest/secrets.json` by hand, restart the API |
| CI runs the wrong suites on your PR | Path filters in `.github/workflows/*.yml` | Add your new cross-package path to that workflow's `paths:` (e.g. `reviewer-core/**` already triggers `server-unit` because the server type-checks against it) |
| `pnpm install` fails in `server/` on Windows | `@ast-grep/napi` win32 prebuilt | Update ast-grep or use WSL (CI is Linux-only) |
| Empty `LOG_LEVEL` crashes config | (Was a bug — fixed in `66727c8`; empty is now coerced to default `info`) | Pull `main` |
| Second lockfile appears in `reviewer-core/` | You ran `pnpm install` there | Delete `pnpm-lock.yaml` from `reviewer-core/`; use `npm ci` |

---

Read this plus the per-package READMEs (`server/`, `client/`, `reviewer-core/`, `e2e/`), `TESTING.md`, and `docs/agent-prompts/README.md` and you can land your first PR. The lesson roadmap (L01–L08 in the root README) is the order features come back; don't preemptively add tables — they're already in the schema.
