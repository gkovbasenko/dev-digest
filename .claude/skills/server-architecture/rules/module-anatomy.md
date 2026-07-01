---
name: module-anatomy
description: Files inside a module folder and each file's responsibility
metadata:
  tags: module, anatomy, files, structure
---

# Module Anatomy

Every feature lives under `server/src/modules/<name>/`.

## Standard file set

```
modules/<name>/
├── routes.ts          ← required: Fastify plugin, HTTP transport only
├── service.ts         ← when there is business logic to orchestrate
├── repository.ts      ← when the module owns DB tables
├── helpers.ts         ← pure functions: URL parsing, DTO conversion, status math
├── constants.ts       ← enums, lookup maps, static config
├── types.ts           ← module-local TypeScript types / interfaces (not Zod)
└── index.ts           ← public re-exports for cross-module consumption (rare)
```

The `reviews` module splits its repository into sub-repos because it owns three distinct tables:
```
modules/reviews/
└── repository/
    ├── review.repo.ts   ← reviews table
    ├── pull.repo.ts     ← pulls table + findings aggregation
    └── run.repo.ts      ← agent_runs + run_traces
```
`modules/reviews/repository.ts` is then a composite that delegates to the three.

The `repo-intel` module has a `pipeline/` subfolder for multi-step indexing stages (full, incremental, rank, repo-map, walk). Each stage is a function, not a class.

## `routes.ts`

- Default-export a Fastify plugin: `export default async function reposRoutes(app: FastifyInstance) { ... }`
- Registered by `modules/index.ts` — never `import` a routes file manually elsewhere
- Calls `getContext(app.container, req)` from `modules/_shared/context.ts` to get `{ workspaceId, userId }`
- Passes container or resolved services to helpers; never calls adapters

## `service.ts`

- Export a class named `<Name>Service`
- Constructor receives `Container` (not individual adapters):
  ```ts
  export class ReviewService {
    constructor(private container: Container) {}
  }
  ```
- Each public method is one use-case; keep them narrow
- Returns DTOs (types from `vendor/shared/contracts/` or module `types.ts`), never `Db*Row` types

## `repository.ts`

- Export a class named `<Name>Repository`
- Constructor receives only `Db`:
  ```ts
  export class AgentRepository {
    constructor(private db: Db) {}
  }
  ```
- Every method takes `workspaceId: string` as first argument (tenancy boundary)
- Returns `AgentRow` / `PrRow` / etc. from `db/rows.ts`; DTO conversion happens in service/helpers

## `helpers.ts`

- Pure functions only — no `this`, no side effects
- Used by `service.ts` and `routes.ts`
- Examples: `parseGithubUrl`, `toRepoDto`, `computePrStatus`, `buildFindingDto`

## `constants.ts`

- `const` enums, string unions, static lookup maps, default values
- No logic, no imports from the rest of the codebase (only stdlib/vendor contracts OK)

## Cross-module shared files

```
modules/_shared/context.ts   — getContext() helper
modules/_shared/schemas.ts   — IdParams and other shared Zod route-param schemas
```

## When to add a new module

Add a new folder under `modules/` when:
- The feature has its own DB tables, or
- It requires independent HTTP routes, or
- Its business logic is clearly separate from existing modules

Register the new plugin in `modules/index.ts`.
