---
name: file-placement
description: Decision guide for where to put new files in client/src/
metadata:
  tags: architecture, file-structure, placement
---

# File Placement Decision Guide

## Decision tree

```
New UI piece — who uses it?
│
├── Only one page/route
│   └── app/<route>/_components/<ComponentName>/
│
├── 2+ pages, has domain logic / composes primitives
│   └── src/components/<component-name>/
│
├── Raw primitive (Button, Modal, Badge…) or form control
│   └── vendor/ui/primitives/ or vendor/ui/kit/
│
└── App shell / sidebar / nav
    └── vendor/ui/shell/
```

## Rule for `_components/` (route-private)

- `_` prefix makes Next.js skip it as a route segment.
- Place here when the component is **only** ever rendered from that page or its children.
- Sub-components of a `_components/` component nest inside it: `_components/Parent/_components/Child/`.

```
app/repos/[repoId]/pulls/[number]/
└── _components/
    ├── FindingsPanel/        ← used only on this page
    │   ├── FindingsPanel.tsx
    │   ├── index.ts
    │   └── _components/
    │       └── FindingRow/
    │           ├── FindingRow.tsx
    │           └── index.ts
    └── VerdictBanner/
```

## Rule for `src/components/` (cross-page shared)

- Move a component here the moment a **second** page needs it.
- These components may use hooks from `lib/hooks/` and compose vendor primitives.
- Each component gets its own folder following the standard anatomy.

```
src/components/
├── diff-viewer/       ← used in PR detail + agent editor
├── findings-preview/  ← used in PR list + PR detail
└── page-shell/        ← used by every page
```

## Rule for `vendor/ui/` (primitives & form kit)

- `primitives/` — atoms with no business logic: `Button`, `Badge`, `Card`, `Skeleton`, `Toggle`, etc.
- `kit/` — complex interactive controls: `Modal`, `Drawer`, `Tabs`, `Dropdown`, `TextInput`, etc.
- `shell/` — app frame: `AppFrame`, `Sidebar`, `Topbar`, `NavItem`, `RepoSwitcher`.
- `charts/` — data vis: `LineChart`, `Donut`, `MetricCard`, `Sparkline`.
- `command-palette/` — `CommandPalette`, `ShortcutsHelp`.

**Do not** add a new component here unless it truly has no domain knowledge. If it needs a hook or knows about the app domain, it belongs in `src/components/` instead.

## Rule for `lib/`

| File | Purpose |
|---|---|
| `lib/api.ts` | Single fetch boundary — all calls to the server |
| `lib/hooks/*.ts` | TanStack Query hooks, one file per domain |
| `lib/providers.tsx` | Root `<Provider>` wrapper |
| `lib/repo-context.tsx` | Repository state context |
| `lib/theme.tsx` | Theme context |
| `lib/toast.tsx` | Notification system |
| `lib/*.ts` | Domain utilities (github-urls, model-label, feature-models…) |

Pure utilities that don't depend on React → plain `.ts` in `lib/`.
Utilities needing React state/context → hook file in `lib/hooks/`.

## Rule for `vendor/shared/contracts/`

Zod schemas for API contracts shared with the server. **Mirror any changes** from `server/src/vendor/shared/contracts/` manually — there is no sync step (see `INSIGHTS.md`).
