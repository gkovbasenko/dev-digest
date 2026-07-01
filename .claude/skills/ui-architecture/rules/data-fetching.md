---
name: data-fetching
description: How server data flows into components — lib/api.ts → lib/hooks/* → components
metadata:
  tags: data-fetching, tanstack-query, hooks, api
---

# Data Fetching

All server data flows through a single path: `lib/api.ts` → `lib/hooks/*` → components.
Never break this chain.

## The three layers

### 1. `lib/api.ts` — fetch boundary

Single file that owns all HTTP calls to the server. Components and hooks never call `fetch()` directly.

```ts
// lib/api.ts
export async function fetchPullRequest(repoId: string, number: number) {
  const res = await fetch(`/api/repos/${repoId}/pulls/${number}`)
  if (!res.ok) throw new Error(`fetchPullRequest failed: ${res.status}`)
  return pullRequestSchema.parse(await res.json())
}
```

- One function per API endpoint.
- Parses/validates with the Zod schema from `vendor/shared/contracts/`.
- Throws on non-ok responses.

### 2. `lib/hooks/*.ts` — TanStack Query wrappers

Hook files wrap `lib/api.ts` functions with `useQuery` / `useMutation`. Organized by domain:

| File | Domain |
|---|---|
| `lib/hooks/core.ts` | Platform, repos |
| `lib/hooks/agents.ts` | Agents |
| `lib/hooks/reviews.ts` | Pull requests, review runs |
| `lib/hooks/trace.ts` | Run traces |
| `lib/hooks/repo-intel.ts` | Repository intelligence |

```ts
// lib/hooks/reviews.ts
import { useQuery } from '@tanstack/react-query'
import { fetchPullRequest } from '../api'

export function usePullRequest(repoId: string, number: number) {
  return useQuery({
    queryKey: ['pull', repoId, number],
    queryFn: () => fetchPullRequest(repoId, number),
  })
}
```

All hooks are re-exported from `lib/hooks/index.ts`:
```ts
export * from './core'
export * from './reviews'
// ...
```

### 3. Components — consume hooks

Components import from `@/lib/hooks`, never from individual hook files or api.ts:

```tsx
import { usePullRequest } from '@/lib/hooks'

export function FindingsPanel({ repoId, number }: Props) {
  const { data, isPending, isError } = usePullRequest(repoId, number)
  // ...
}
```

## When to add a new hook

- New API endpoint → new function in `lib/api.ts` + new hook in the relevant domain file.
- If no domain file fits, add a new `lib/hooks/<domain>.ts` and barrel-export it from `lib/hooks/index.ts`.
- Mutations: use `useMutation` and invalidate affected query keys in `onSuccess`.

## Anti-patterns

```tsx
// ✗ direct fetch in component
const res = await fetch('/api/repos/...')

// ✗ importing api.ts directly from a component
import { fetchPullRequest } from '@/lib/api'

// ✗ importing a specific hook file instead of the barrel
import { usePullRequest } from '@/lib/hooks/reviews'
```
