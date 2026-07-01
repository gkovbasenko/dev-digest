---
name: server-architecture
description: "dev-digest server Onion Architecture guide — layers (route → service → repository → adapter), DI container as the only adapter access point, dependency direction, module anatomy, and forbidden patterns. Use when adding routes, services, repositories, or adapters to server/; when reviewing which layer code belongs in; when wiring new external integrations; when writing tests that need adapter mocks."
metadata:
  tags: architecture, onion, server, fastify, di, container, adapters, layers, backend
---

# Server Onion Architecture

This skill covers the `server/` module (`@devdigest/api`, Fastify 5 + Drizzle).
Apply these rules when adding or reviewing any file under `server/src/`.

## Layer diagram

```
┌─────────────────────────────────────────────────────────┐
│  HTTP (routes.ts)                                       │
│  parse · validate · delegate · serialize                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Service (service.ts)                             │  │
│  │  orchestrate · enforce rules · return DTOs        │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  Repository (repository.ts)                 │  │  │
│  │  │  SELECT · INSERT · UPDATE · DELETE          │  │  │
│  │  │  workspace-scoped · Drizzle only            │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
              ↕  only via Container
┌─────────────────────────────────────────────────────────┐
│  Adapters (adapters/*/)                                 │
│  GitHub · Git · LLM · Embedder · Secrets · AST-grep    │
│  thin wrappers · implement interfaces from adapters.ts  │
└─────────────────────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────────────────────┐
│  Platform (platform/*)                                  │
│  Container · Config · Jobs · SSE · Errors · Resilience  │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** outer layers import inner; inner layers never import outer.
Adapters are external — they sit outside the onion and are reached only through `container.*`.

## Sections

- [rules/layers.md](rules/layers.md) — what each layer owns, what it must not do
- [rules/module-anatomy.md](rules/module-anatomy.md) — files inside a module folder
- [rules/container.md](rules/container.md) — DI container: resolving, adding, testing
- [rules/adapters.md](rules/adapters.md) — adapter pattern, interface contract, error wrapping
- [rules/forbidden.md](rules/forbidden.md) — cross-layer violations and anti-patterns

## Quick layer reference

| Layer | File | Imports from |
|---|---|---|
| HTTP | `modules/*/routes.ts` | `_shared/context`, service, schemas |
| Service | `modules/*/service.ts` | repository, `container.*`, `platform/*` |
| Repository | `modules/*/repository.ts` | `db/schema`, `db/client` (Db type) |
| Adapter | `adapters/*/*` | external SDK only, implements interface |
| Container | `platform/container.ts` | all adapters (composition root) |
| Platform | `platform/*` | config, errors, stdlib |

## Module list

| Module | routes | service | repository |
|---|---|---|---|
| `agents` | ✓ | ✓ | ✓ |
| `repos` | ✓ | ✓ | ✓ |
| `reviews` | ✓ | ✓ | ✓ (composite) |
| `pulls` | ✓ | — | ✓ |
| `settings` | ✓ | ✓ | — |
| `repo-intel` | ✓ | ✓ | ✓ |
| `polling` | ✓ | — | — |
| `workspace` | ✓ | — | — |
