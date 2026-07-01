---
name: routing
description: Surface classification and skill mapping for pr-self-review
metadata:
  tags: routing, surfaces, skills
---

# Surface Routing Table

## Surface: `client`

**Triggered by:** any changed file under `client/`

**Skills to load:**

| Skill | Focus areas |
|---|---|
| `ui-architecture` | File placement (`file-placement.md`), component folder anatomy (`component-structure.md`), naming (`naming.md`), data-fetching (`data-fetching.md`) |
| `react-best-practices` | Anti-patterns, state management, hooks rules |
| `react-testing-library` | Test structure, query priority, async patterns |

**Key checks:**
- New component → correct folder (route-private `_components/` vs `src/components/` vs `vendor/ui/`)?
- Component folder has `index.ts` barrel?
- All server data goes through `lib/api.ts` → `lib/hooks/*`? No raw `fetch()` in component?
- New hook added to correct domain file in `lib/hooks/`?
- Test file colocated? Using `fireEvent`, not `userEvent`?
- `"use client"` added only where necessary (state, effects, browser APIs)?
- New primitive added to `vendor/ui/` sub-directory, not ad-hoc?

---

## Surface: `server-routes`

**Triggered by:** `server/src/modules/*/routes.ts`

**Skills to load:**

| Skill | Focus areas |
|---|---|
| `server-architecture` | `layers.md` (route responsibilities), `forbidden.md` (#1 adapter in route, #6 DB in route) |
| `fastify-best-practices` | `routes.md`, `schemas.md`, `error-handling.md` |

**Key checks:**
- Route delegates 100% of business logic to service?
- No adapter calls (`container.git`, `container.github()`, etc.) in handler?
- No Drizzle imports in route file?
- Uses `getContext(app.container, req)` for workspace/user extraction?
- Request validated with Zod schema on the route registration options?
- Errors thrown (not manually returned as 4xx objects)?

---

## Surface: `server-service`

**Triggered by:** `server/src/modules/*/service.ts`

**Skills to load:**

| Skill | Focus areas |
|---|---|
| `server-architecture` | `layers.md` (service responsibilities), `forbidden.md` (#2 adapter instantiation, #3 process.env, #4 DB in service, #5 cross-module import, #9 raw row return) |
| `fastify-best-practices` | `error-handling.md` |

**Key checks:**
- No `new SomeAdapter(...)` in service? All adapters via `container.*`?
- No `process.env` reads? All config from `container.config`?
- No Drizzle imports? All DB access through `this.repo.*`?
- No import of another module's `service.ts`?
- Returns DTOs (types from `vendor/shared/contracts/` or `types.ts`), not raw `*Row` types?
- Errors classified as `NotFoundError`, `ValidationError`, etc. from `platform/errors`?

---

## Surface: `server-repository`

**Triggered by:** `server/src/modules/*/repository.ts`, `server/src/modules/*/repository/*.ts`

**Skills to load:**

| Skill | Focus areas |
|---|---|
| `server-architecture` | `layers.md` (repository responsibilities), `forbidden.md` (#7 business logic in repo, #8 missing workspaceId, #6 raw SQL) |
| `drizzle-orm-patterns` | Query patterns, relations, transactions |

**Key checks:**
- Every query on a tenant-scoped table has `workspaceId` in WHERE?
- No raw SQL (`db.execute(sql\`...\`)`)?
- No business logic (dedup, validation, quota) — only CRUD?
- Constructor takes only `Db`?
- Returns typed row aliases from `db/rows.ts`, not plain objects?

---

## Surface: `server-adapters`

**Triggered by:** `server/src/adapters/**`

**Skills to load:**

| Skill | Focus areas |
|---|---|
| `server-architecture` | `adapters.md` (interface-first, error wrapping, resilience, secrets) |

**Key checks:**
- Implements exactly one interface from `vendor/shared/adapters.ts`?
- No business logic — only external API translation?
- Network calls wrapped with `withRetry` / `withTimeout` from `platform/resilience`?
- Errors caught and re-thrown as `ExternalServiceError`?
- No `container` or `Db` in constructor — credentials only?
- Added a mock in `adapters/mocks.ts`?
- Exported from `adapters/index.ts`?

---

## Surface: `server-schema`

**Triggered by:** `server/src/db/schema/**`

**Skills to load:**

| Skill | Focus areas |
|---|---|
| `drizzle-orm-patterns` | `schema-definition.md` |
| `postgresql-table-design` | Constraints, indexing, data types |

**Key checks:**
- New table has `workspaceId` FK if it's tenant-scoped?
- `pnpm db:generate` was run after schema change (migration file present in diff)?
- No hand-edited files in `db/migrations/`?
- Column types match Postgres best practices (no `varchar` without length where `text` fits, etc.)?
- FK constraints defined?

---

## Surface: `server-general`

**Triggered by:** any `server/src/**` file not matched by a more specific surface above

**Skills to load:**

| Skill | Focus areas |
|---|---|
| `server-architecture` | `module-anatomy.md`, `container.md` |
| `fastify-best-practices` | relevant section based on file type |

**Key checks:**
- New file in correct layer/folder per module anatomy?
- New module registered in `modules/index.ts`?
- New adapter registered in `platform/container.ts`?

---

## Surface: `contracts`

**Triggered by:** `server/src/vendor/shared/contracts/**` or `client/src/vendor/shared/contracts/**`

**Skills to load:** none (check manually)

**Key checks:**
- If `server/src/vendor/shared/contracts/*.ts` changed → matching change in `client/src/vendor/shared/contracts/*.ts` (manual mirror, no sync step — see repo-root `INSIGHTS.md`)?
- Zod schema naming follows `<name>Schema` convention?
- Type alias exported alongside schema: `export type Foo = z.infer<typeof fooSchema>`?
