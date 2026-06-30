# client — map for Claude

`@devdigest/web` — Next.js studio UI for review results.

## Stack

- Next.js 15.1 (App Router), React 19
- TanStack Query 5, next-intl 3, Zod 3.24
- Tailwind CSS 4, recharts, mermaid, react-markdown
- TypeScript 5.7, vitest 2.1 + jsdom, Testing Library

## Commands

- `pnpm dev` — `next dev -p 3000`
- `pnpm build` / `pnpm start`
- `pnpm test` — vitest + jsdom
- `pnpm typecheck`

## Map

- `src/app/` — App Router routes (pages, layouts, route groups)
- `src/components/` — page-level components
- `src/lib/api.ts` — single fetch boundary to the server
- `src/lib/hooks/` — TanStack Query hooks (one per resource)
- `src/lib/{providers,repo-context,theme,toast}.tsx` — app-wide context
- `src/vendor/` — vendored UI primitives and shared Zod
- `src/i18n/messages/<locale>/*.json` — translation messages
- `src/test/` — test setup

## Non-default conventions

- All server data access goes through `src/lib/api.ts` and a TanStack Query hook in `src/lib/hooks/` — no ad-hoc `fetch()` in components.
- UI primitives come from `src/vendor/ui` — don't add new primitives outside it.
- Server vs Client components: default to RSC; add `"use client"` only when needed (state, effects, browser APIs).
- Translation keys must mirror across every locale file under `src/i18n/messages/`.
- Tests use `fireEvent` from `@testing-library/react` — `@testing-library/user-event` is **not** installed, don't import it.

## Gotchas

- Tailwind 4 uses `@tailwindcss/postcss`, not the legacy plugin — don't downgrade.
- Mermaid and recharts are client-only; gate with `"use client"` or dynamic import.

## Do not touch

- Don't bypass `src/lib/api.ts` for direct fetches.
- Don't import server-only types from `server/` directly — go through `src/vendor/shared` (Zod contracts).

## Skills (invoke when relevant)

- `ui-architecture` — file placement, component folder anatomy, data-fetching flow, naming, vendor UI, tests

## Docs (read on demand)

- [README.md](./README.md) — route map, stack overview
- [../ONBOARDING.md](../ONBOARDING.md) — end-to-end walkthrough

@INSIGHTS.md
