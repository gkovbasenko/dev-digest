---
name: component-structure
description: Standard folder anatomy every component follows in client/src/
metadata:
  tags: components, structure, folder-pattern
---

# Component Folder Anatomy

Every component — whether in `_components/`, `src/components/`, or `vendor/ui/` — uses the same folder pattern.

## Standard layout

```
ComponentName/
├── ComponentName.tsx     ← required: the component
├── index.ts              ← required: barrel export
├── ComponentName.test.tsx ← when tested
├── constants.ts          ← static values, lookup maps, config
├── helpers.ts            ← pure utility functions used by this component
├── styles.ts             ← Tailwind class strings as named objects/constants
└── _components/          ← nested private sub-components (same pattern recursively)
    └── SubComponent/
        ├── SubComponent.tsx
        ├── index.ts
        └── ...
```

## Required files

**`ComponentName.tsx`** — the component itself. One default export.

**`index.ts`** — always a re-export, nothing more:
```ts
export { ComponentName } from './ComponentName'
```
Consumers import from the folder, not the `.tsx` file:
```ts
import { FindingsPanel } from './_components/FindingsPanel'  // ✓
import { FindingsPanel } from './_components/FindingsPanel/FindingsPanel'  // ✗
```

## Optional supporting files

**`constants.ts`** — static data, enums, label maps. No logic.
```ts
export const SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
} as const
```

**`helpers.ts`** — pure functions that transform or derive data for this component. If a helper is used in 2+ components, move it to `lib/`.
```ts
export function formatRunDuration(ms: number): string { ... }
```

**`styles.ts`** — Tailwind class strings as named constants to keep JSX readable:
```ts
export const styles = {
  root: 'flex flex-col gap-2 rounded-lg border border-neutral-200',
  header: 'flex items-center justify-between px-4 py-3',
}
```

## Nesting rules

- Sub-components live in `_components/` inside their parent's folder.
- The `_` prefix prevents Next.js from treating the folder as a route segment.
- Nesting can go 2–3 levels deep; if it goes deeper, consider promoting the sub-component to `src/components/`.
- A sub-component's `index.ts` exports only to its direct parent — don't re-export it further up.

## What NOT to put in a component folder

- API calls or fetch logic → `lib/api.ts`
- TanStack Query hooks → `lib/hooks/<domain>.ts`
- Zod schemas → `vendor/shared/contracts/<domain>.ts`
- Global state / context → `lib/<context>.tsx`

## Example: RunTraceDrawer

```
_components/RunTraceDrawer/
├── RunTraceDrawer.tsx
├── RunTraceDrawer.test.tsx
├── index.ts
├── constants.ts
├── helpers.ts
├── styles.ts
└── _components/
    ├── TraceSection/
    │   ├── TraceSection.tsx
    │   └── index.ts
    ├── ToolCallRow/
    │   ├── ToolCallRow.tsx
    │   └── index.ts
    ├── FindingsSection/
    │   ├── FindingsSection.tsx
    │   └── index.ts
    └── atoms.tsx          ← tiny shared atoms used only within RunTraceDrawer
```

`atoms.tsx` (no folder) is acceptable for tiny inline components too small to warrant their own folder, used only within one parent.
