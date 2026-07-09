---
name: correct-patterns
description: Patterns that LOOK like violations but are correct under this project's conventions — do not flag these
metadata:
  tags: false-positives, correct-patterns, review, precision
---

# Correct Patterns (do NOT flag these)

A reviewer who knows generic "clean architecture" but not *this* codebase tends to flag the
following as violations. They are **not**. Flagging them wastes the author's time and erodes
trust in the review, so check a suspected violation against this list before raising it.

Each entry: the pattern, why it looks wrong, why it is actually correct here.

## 1. `constructor(private container: Container)` in a service

**Looks like:** a service-locator anti-pattern / hiding dependencies behind a god-object.
**Actually correct.** Passing the whole `Container` into a service is the project's **mandated**
DI shape (`module-anatomy.md`, `container.md`). It is how services reach adapters and shared
repos through a single composition root. Do **not** recommend "inject the concrete dependencies
instead" — that is the pattern this codebase deliberately rejects.

## 2. `new <OwnModule>Repository(container.db)` inside a service

**Looks like:** forbidden direct instantiation / bypassing the container (`forbidden.md` #2) or
direct DB access (`forbidden.md` #4).
**Actually correct.** A service may construct **its own module's** repository and hand it
`container.db`. Only **adapters** are container-only (`forbidden.md` #2 is about adapters like
`new AnthropicLLM(...)`), and passing `container.db` to a repo constructor is not the forbidden
"query the DB from a service" pattern — the repo is still the only thing touching Drizzle.
(Constructing **another** module's repository is still a violation — see `forbidden.md` #5.)

## 3. A repository method returning a `*Row` type (`typeof t.x.$inferSelect`)

**Looks like:** leaking the DB shape / DTO-skipping (`forbidden.md` #9).
**Actually correct.** Repositories **return row types** by design; DTO conversion happens one
layer up in the service/helpers (`module-anatomy.md`, `layers.md`). `forbidden.md` #9 is about a
**service** returning a raw row, not a repository. Seeing `Promise<AgentRow>` on a repository
method is the expected contract, not a leak.

## 4. Cross-module reads via `container.reviewRepo` / `container.agentsRepo`

**Looks like:** cross-module coupling.
**Actually correct.** These shared repositories on the container are the **sanctioned** channel
for cross-module data (`container.md`, `forbidden.md` #5/#10). A service reading
`this.container.agentsRepo.listEnabled(workspaceId)` is doing exactly the right thing. The
violation is importing another module's repository **class** directly — not using the container's
shared repo.

## 5. A route calling a pure `helpers.ts` function that contains `if`s

**Looks like:** business logic in the route (`layers.md` route rule).
**Actually correct.** The route rule forbids business logic living **in the handler**, not
calling a pure helper. `parseRepoUrl`, `computePrStatus`, `toRepoDto` etc. are pure functions in
`helpers.ts`; a route (or service) may call them. Branching **inside a pure helper** is fine —
what's forbidden is an `if` enforcing a domain rule written **inline in the handler**.

## 6. `await container.github()` / `await container.llm('openai')` in a service

**Looks like:** the adapter should have been injected, not fetched.
**Actually correct.** Async adapter getters are the container's documented API for
credential-bearing adapters (`container.md`). A service resolving `await this.container.github()`
at call time is the intended usage, not a missing injection.

## 7. Raw SQL inside a file under `db/migrations/`

**Looks like:** raw-SQL violation (`forbidden.md` #6).
**Actually correct.** `forbidden.md` #6 **explicitly exempts** generated migration files. Raw SQL
in `db/migrations/*` is expected; only raw SQL in repositories/services is a violation.

---

**Rule of thumb:** before flagging, ask *"which layer is this, and does the specific rule name
this exact case?"* If the suspicious thing is (a) a repo returning a row, (b) a service holding
the container, (c) a service building its own repo, (d) a container shared-repo read, or (e) a
pure helper with a branch — it is almost certainly correct. Reserve findings for real
layer-boundary breaks.
