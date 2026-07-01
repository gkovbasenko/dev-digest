---
name: pr-self-review
description: "Pre-done self-review workflow. Runs the uncommitted diff through a second pass and routes to surface-specific skills before marking work complete. Invoke before saying the task is done, before creating a PR, or on request. Surfaces: client/ → ui-architecture + react-best-practices + react-testing-library; server/ → server-architecture + fastify-best-practices + drizzle-orm-patterns."
user-invocable: true
metadata:
  tags: review, workflow, dispatcher, self-review, quality-gate
---

# pr-self-review — Pre-Done Quality Gate

A second-pass workflow that runs on **local changes** (uncommitted diff) before the work is declared done. It classifies changed files by surface and applies the relevant skill rules to each surface.

Invoke: `/pr-self-review` or whenever you are about to say "done" / "ready" / "complete".

---

## Procedure

### Step 1 — Collect the diff

```bash
git diff HEAD          # staged + unstaged combined
git diff --name-only HEAD   # file list only (for routing)
```

If the working tree is clean (no local changes), fall back to:
```bash
git diff HEAD~1        # last commit vs its parent
git diff --name-only HEAD~1
```

### Step 2 — Classify files by surface

Parse the changed file paths and assign each to one or more surfaces using the routing table in [rules/routing.md](rules/routing.md).

Multiple surfaces may be active in the same diff. Each active surface gets its own review pass.

### Step 3 — Load skills for active surfaces

For each active surface, read the skill files listed in [rules/routing.md](rules/routing.md). Focus on the rules that apply to the specific file types changed (e.g., if only `routes.ts` files changed on server, focus on layers + forbidden rules, not drizzle schema rules).

### Step 4 — Review each surface

For each surface, scan the diff against the loaded skill rules. Look specifically for:

- **Forbidden patterns** — violations that must be fixed before done (high severity)
- **Structural misplacements** — files in wrong layer/folder (medium severity)  
- **Missing conventions** — barrel export missing, workspaceId filter absent, etc. (medium severity)
- **Style / minor** — naming inconsistency, missing `index.ts`, etc. (low severity)

Do not flag things the skills explicitly allow or things outside the skill rules' scope.

### Step 5 — Output the report

Use the format from [rules/report-format.md](rules/report-format.md).

### Step 6 — Verdict

- **READY** — no high or medium findings. State: "Self-review passed. Ready."
- **WARN** — medium findings only. State findings, ask whether to proceed or fix.
- **BLOCK** — any high finding. State findings. Do not proceed until resolved.

If the verdict is WARN or BLOCK, offer to fix the findings before continuing.

---

## Quick routing summary

| Changed path | Surfaces triggered |
|---|---|
| `client/**` | `client` |
| `server/src/modules/*/routes.ts` | `server-routes` |
| `server/src/modules/*/service.ts` | `server-service` |
| `server/src/modules/*/repository.ts` | `server-repository` |
| `server/src/adapters/**` | `server-adapters` |
| `server/src/db/schema/**` | `server-schema` |
| `server/src/**` (catch-all) | `server-general` |
| `vendor/shared/contracts/**` | `contracts` |

See [rules/routing.md](rules/routing.md) for the full skill mapping per surface.
