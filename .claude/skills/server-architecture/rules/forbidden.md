---
name: forbidden
description: Explicit cross-layer violations and anti-patterns — what is never allowed
metadata:
  tags: forbidden, anti-patterns, violations, rules
---

# Forbidden Patterns

These are hard rules. If you see them in a review, reject them.

## 1. Adapter call in a route handler

```ts
// ✗ route calling adapter directly
app.get('/repos/:id/diff', async (req) => {
  const diff = await app.container.git.diff(req.params.id, 'HEAD')  // ← forbidden
  return diff
})
```

Routes delegate to services. Services call adapters. A route that reaches `container.git` or `container.github()` has skipped the service layer entirely, bypassing business rules and making the endpoint untestable without a real Git repo.

**Fix:** put the logic in `service.ts`, call the service from the route.

---

## 2. Direct adapter instantiation outside `container.ts`

```ts
// ✗ service newing an adapter
export class ReviewService {
  private llm = new AnthropicLLM(process.env.ANTHROPIC_KEY!)  // ← forbidden
}
```

Only `platform/container.ts` instantiates adapters. This rule exists so tests can inject mocks and so the same adapter instance is reused across the request lifecycle.

**Fix:** `this.container.llm('anthropic')` — let the container own the lifecycle.

---

## 3. `process.env` outside `platform/config.ts`

```ts
// ✗ reading env directly
const token = process.env.GITHUB_TOKEN  // in service, adapter, anywhere except config.ts
```

`platform/config.ts` is the only allowed place to read environment variables. It validates them at startup with Zod and panics fast if required vars are missing. Reading them ad-hoc elsewhere means a missing var surfaces as a runtime failure deep in a call stack.

**Fix:** add the var to `AppConfig` in `platform/config.ts`; read it from `container.config.*`.

---

## 4. Database access in a route or service

```ts
// ✗ Drizzle import in a route
import { db } from '../../db/client'

app.get('/agents', async () => {
  return db.select().from(agents).where(...)  // forbidden in route
})

// ✗ Drizzle import in a service
export class AgentService {
  async list(workspaceId: string) {
    return this.container.db.select().from(agents)  // ← forbidden in service too
  }
}
```

All DB access goes through a `Repository` class. Services call `this.repo.*`.

**Fix:** create or extend the module's `repository.ts`.

---

## 5. Cross-module repository import

```ts
// ✗ reviews service importing agents repository directly
import { AgentRepository } from '../agents/repository'

export class ReviewService {
  constructor(private agentRepo: AgentRepository) {}
}
```

Modules don't import each other's internals. Cross-module data is accessed via the shared repositories on the container: `container.agentsRepo`, `container.reviewRepo`.

---

## 6. Raw SQL

```ts
// ✗ raw SQL anywhere
await this.db.execute(sql`SELECT * FROM repos WHERE workspace_id = ${workspaceId}`)
```

Use Drizzle's query builder. Raw SQL is only allowed in generated migration files under `db/migrations/`.

---

## 7. Business logic in a repository

```ts
// ✗ dedup logic in repository
async add(workspaceId: string, url: string) {
  const existing = await this.findByUrl(workspaceId, url)
  if (existing) throw new Error('Already added')   // ← business rule in data layer
  return this.db.insert(repos).values(...)
}
```

Repositories are CRUD. Business rules (dedup, quota, validation) belong in the service.

---

## 8. Missing `workspaceId` filter in a repository query

```ts
// ✗ unscoped query
async listAll() {
  return this.db.select().from(repos)  // returns ALL workspaces' data
}
```

Every query on a tenant-scoped table must filter by `workspaceId`. No exceptions.

---

## 9. DTO skipping — returning raw DB rows from a service

```ts
// ✗ returning Drizzle row type from service
async getAgent(id: string): Promise<AgentRow> { ... }
```

Services return DTOs typed by `vendor/shared/contracts/` or module `types.ts`. The DB schema is an implementation detail — returning `AgentRow` leaks it.

---

## 10. Importing another module's `service.ts` directly

```ts
// ✗ direct cross-module service import
import { AgentService } from '../agents/service'

export class ReviewService {
  constructor(private agentService: AgentService) {}
}
```

Use the container for cross-module coordination. If `ReviewService` needs agent data, it reads from `container.agentsRepo`.
