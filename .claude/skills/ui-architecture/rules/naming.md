---
name: naming
description: File and folder naming conventions for client/src/
metadata:
  tags: naming, conventions, file-names
---

# Naming Conventions

## Components

| Thing | Convention | Example |
|---|---|---|
| Component folder | PascalCase | `FindingsPanel/` |
| Component file | PascalCase matching folder | `FindingsPanel.tsx` |
| Test file | PascalCase + `.test.tsx` | `FindingsPanel.test.tsx` |
| Barrel file | always `index.ts` | `index.ts` |
| Supporting files | camelCase | `constants.ts`, `helpers.ts`, `styles.ts` |
| Private sub-component folder | `_components/` | `_components/FindingRow/` |

## Pages and routes

| Thing | Convention | Example |
|---|---|---|
| Page file | always `page.tsx` | `app/agents/page.tsx` |
| Layout file | always `layout.tsx` | `app/layout.tsx` |
| Dynamic segment | `[param]` | `[repoId]/`, `[number]/` |
| Private folder | `_prefix` | `_components/` |

## Utilities and hooks

| Thing | Convention | Example |
|---|---|---|
| Hook function | `use` prefix, camelCase | `usePullRequest`, `useShellContext` |
| Hook file (domain) | camelCase | `reviews.ts`, `repo-intel.ts` |
| Utility function | camelCase | `formatRunDuration`, `buildGithubUrl` |
| Utility file | camelCase, hyphen-separated | `github-urls.ts`, `model-label.ts` |
| Context file | camelCase + `-context` suffix | `repo-context.tsx` |

## Exports

- Components: **named export** from `.tsx`, re-exported via `index.ts`.
- Default exports are used only for Next.js page/layout files.
- Hook barrels (`lib/hooks/index.ts`): `export * from './domain'` pattern.

```ts
// ComponentName.tsx — named export
export function FindingsPanel() { ... }

// index.ts — re-export, nothing else
export { FindingsPanel } from './FindingsPanel'

// page.tsx — default export (Next.js requirement)
export default function PullsPage() { ... }
```

## Zod schemas and types

Follow the conventions in `vendor/shared/contracts/`:
- Schema variable: camelCase + `Schema` suffix — `pullRequestSchema`
- Inferred type: PascalCase — `type PullRequest = z.infer<typeof pullRequestSchema>`

## Common mistakes

- Folder named `findingsPanel` → should be `FindingsPanel`
- Component file named `index.tsx` → always name it after the component
- Default export for a non-page component → use named export
- Hook file named `useReviews.ts` → domain files use `reviews.ts`, not `useReviews.ts`
