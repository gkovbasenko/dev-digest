---
name: report-format
description: Output format for pr-self-review findings and verdict
metadata:
  tags: report, format, output
---

# Report Format

## Structure

```
## Self-review — <N> files changed

### Surface: Client  (`client/src/...`)
Skills applied: ui-architecture · react-best-practices · react-testing-library

<findings or ✓ No issues>

### Surface: Server — routes  (`server/src/modules/reviews/routes.ts`)
Skills applied: server-architecture · fastify-best-practices

<findings or ✓ No issues>

---
**Verdict: READY / WARN / BLOCK**
```

## Finding format

Each finding:
```
- [HIGH|MED|LOW] <file>:<line-range> — <what's wrong> (<which rule>)
```

Examples:
```
- [HIGH] server/src/modules/reviews/routes.ts:42–47 — adapter called directly in route handler; must go through service (server-architecture: forbidden #1)
- [MED]  client/src/app/agents/_components/AgentForm/index.ts — missing barrel export; consumers can't import from folder path (ui-architecture: component-structure)
- [LOW]  server/src/modules/repos/service.ts:18 — function named `getRepo` should be `findRepo` to match repository naming convention (server-architecture: module-anatomy)
```

## Severity guide

| Severity | Meaning | Verdict impact |
|---|---|---|
| **HIGH** | Forbidden pattern (cross-layer violation, missing workspaceId, adapter in route, raw SQL, etc.) | BLOCK |
| **MED** | Structural issue (wrong folder, missing convention, raw row returned from service, etc.) | WARN |
| **LOW** | Style / naming inconsistency that doesn't break correctness | READY (note only) |

## Verdicts

**READY** — zero HIGH or MED findings. Output:
```
---
**Verdict: READY** — self-review passed. N low-severity notes (non-blocking).
```

**WARN** — MED findings, no HIGH. Output:
```
---
**Verdict: WARN** — N medium finding(s). Fix before merging or confirm to proceed.
```

**BLOCK** — any HIGH finding. Output:
```
---
**Verdict: BLOCK** — N high finding(s) must be fixed before this is done.
```

After WARN or BLOCK, offer:
> Fix the findings above? (y/n)
