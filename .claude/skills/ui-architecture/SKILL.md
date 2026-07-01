---
name: ui-architecture
description: "dev-digest client architecture guide — where to put new files, component folder anatomy, data-fetching flow, naming conventions, vendor UI usage, and test setup. Use when adding pages, components, hooks, or tests to client/; when deciding where a new file belongs; when reviewing component structure; when wiring up server data in a new feature."
metadata:
  tags: next.js, react, architecture, components, file-structure, data-fetching, testing, client
---

# Client UI Architecture

This skill covers the `client/` module (`@devdigest/web`, Next.js 15 App Router).
Apply these rules when adding or reviewing any file under `client/src/`.

## Scope rules — where does a new file go?

See [rules/file-placement.md](rules/file-placement.md) for the decision tree:
- `app/*/_components/` — used only by one page/route
- `src/components/` — shared across 2+ pages, not a raw primitive
- `vendor/ui/` — raw UI primitives and form controls (Button, Modal, etc.)
- `lib/` — utilities, contexts, providers, API boundary

## Component folder anatomy

See [rules/component-structure.md](rules/component-structure.md) for the standard folder pattern every component follows:
- Required files: `ComponentName.tsx`, `index.ts`
- Optional files: `constants.ts`, `helpers.ts`, `styles.ts`, `.test.tsx`
- Nested private sub-components: `_components/SubName/`

## Data fetching

See [rules/data-fetching.md](rules/data-fetching.md):
- All server data flows through `lib/api.ts` → `lib/hooks/*` (TanStack Query v5)
- Never `fetch()` directly in a component
- Hook files are organized by domain

## Naming conventions

See [rules/naming.md](rules/naming.md):
- PascalCase folder + file for components
- camelCase for utilities, hooks, helpers
- Barrel exports via `index.ts`

## Vendor UI — primitives and kit

See [rules/vendor-ui.md](rules/vendor-ui.md):
- `vendor/ui/primitives/` — atoms (Button, Badge, Card…)
- `vendor/ui/kit/` — form controls and complex widgets (Modal, Drawer, Tabs…)
- `vendor/ui/shell/` — app frame, sidebar, nav
- `vendor/ui/charts/` — data visualization
- Never add new primitives outside `vendor/ui/`

## Testing

See [rules/testing.md](rules/testing.md):
- Tests are colocated (`ComponentName.test.tsx` next to source)
- Stack: vitest 2.1 + jsdom + @testing-library/react
- Uses `fireEvent`, not `userEvent` (not installed)
- Setup file: `src/test/setup.ts`

## Quick reference: routes

| Route | File |
|---|---|
| `/` | `app/page.tsx` |
| `/onboarding` | `app/onboarding/page.tsx` |
| `/agents` | `app/agents/page.tsx` |
| `/agents/[id]` | `app/agents/[id]/page.tsx` |
| `/repos/[repoId]/pulls` | `app/repos/[repoId]/pulls/page.tsx` |
| `/repos/[repoId]/pulls/[number]` | `app/repos/[repoId]/pulls/[number]/page.tsx` |
| `/settings/[section]` | `app/settings/[section]/page.tsx` |
