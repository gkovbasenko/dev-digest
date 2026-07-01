---
name: layers
description: What each architectural layer owns and is forbidden from doing
metadata:
  tags: layers, onion, responsibilities
---

# Layer Responsibilities

## Route layer (`modules/*/routes.ts`)

**Owns:**
- Fastify route registration
- Request parsing and Zod schema validation
- Context extraction via `getContext(app.container, req)` → `{ workspaceId, userId }`
- Delegating to the service
- Setting HTTP status codes
- Error propagation (thrown errors reach the centralized handler in `app.ts`)

**Must not:**
- Contain business logic — any `if` that isn't about HTTP belongs in the service
- Touch the database — zero Drizzle imports
- Call adapters directly — no `container.git`, `container.github`, etc. in route handlers
- Instantiate services or repositories — receive them via constructor or closure over container

```ts
// ✓ correct route
app.post('/repos', { schema: { body: AddRepoBody } }, async (req) => {
  const { workspaceId, userId } = await getContext(app.container, req)
  const repo = await service.add(workspaceId, userId, req.body.url)
  return repo
})

// ✗ adapter call in route
app.get('/repos/:id/diff', async (req) => {
  const diff = await app.container.git.diff(...)  // forbidden
})
```

---

## Service layer (`modules/*/service.ts`)

**Owns:**
- Business orchestration: sequences of repository reads, adapter calls, transformations
- Enforcement of business rules (dedup, validation beyond schema, quota)
- Returning typed DTOs (never raw DB rows)
- Error classification (throw `NotFoundError`, `ValidationError`, etc. from `platform/errors`)

**Must not:**
- Import `Request`, `Reply`, or any Fastify type
- Query the database directly — delegate to `this.repo.*`
- Instantiate adapters — resolve via `container.*`
- Import another module's service directly (use `container.agentsRepo`, `container.reviewRepo` for cross-module data)

```ts
// ✓ correct service
export class RepoService {
  constructor(private container: Container) {}

  async add(workspaceId: string, userId: string, url: string) {
    const parsed = parseGithubUrl(url)           // helper, pure
    const existing = await this.repo.findByFullName(workspaceId, parsed.fullName)
    if (existing) throw new ValidationError('Repo already added')
    const repo = await this.repo.insert(workspaceId, parsed)
    await this.container.jobs.enqueue('clone', { repoId: repo.id })
    return toRepoDto(repo)
  }
}

// ✗ adapter in service constructor
export class RepoService {
  constructor(private git: GitClient) {}  // forbidden — use Container
}
```

---

## Repository layer (`modules/*/repository.ts`)

**Owns:**
- All Drizzle ORM queries (SELECT, INSERT, UPDATE, DELETE)
- Workspace tenancy: every query is filtered by `workspaceId`
- Returning typed row aliases from `db/rows.ts`

**Must not:**
- Contain business logic — repositories are CRUD, not domain
- Call adapters
- Import from other module's repositories directly (cross-module data goes through service + container)
- Write raw SQL (use Drizzle query builder)

```ts
// ✓ correct repository
export class RepoRepository {
  constructor(private db: Db) {}

  async findByFullName(workspaceId: string, fullName: string) {
    return this.db.query.repos.findFirst({
      where: and(eq(repos.workspaceId, workspaceId), eq(repos.fullName, fullName)),
    })
  }
}

// ✗ business rule in repository
async add(workspaceId: string, url: string) {
  const parsed = parseGithubUrl(url)   // belongs in service/helpers
  if (await this.findByFullName(...))  // dedup logic belongs in service
    throw new Error('exists')
}
```

---

## Platform layer (`platform/*`)

**Owns:**
- `container.ts` — composition root (all adapter instantiation happens here)
- `config.ts` — environment validation via Zod → `AppConfig`
- `errors.ts` — `AppError`, `NotFoundError`, `ValidationError`, `ExternalServiceError`
- `jobs.ts` — `JobRunner` (async queue for clone, index, polling jobs)
- `sse.ts` — `RunBus` (in-memory pub/sub for streaming review events)
- `resilience.ts` — `withRetry`, `withTimeout` decorators for adapter calls

**Must not:**
- Contain domain or business logic
- Import from `modules/*`

---

## Adapter layer (`adapters/*/*`)

See [adapters.md](adapters.md) for the full contract.

**Short version:** thin wrappers around one external library each.
Instantiated only in `platform/container.ts`.
Never imported directly by routes or services.
