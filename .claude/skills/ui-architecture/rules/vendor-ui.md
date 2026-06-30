---
name: vendor-ui
description: How to use and extend vendor/ui — primitives, kit, shell, charts
metadata:
  tags: vendor, ui-library, primitives, components
---

# Vendor UI (`vendor/ui/`)

A local UI component library with no external UI framework dependency. Import everything through the barrel:

```ts
import { Button, Modal, Badge } from '@/vendor/ui'
```

## Sub-directories

### `primitives/` — atoms

No domain logic. Small, stateless building blocks.

| Component | Purpose |
|---|---|
| `Button` | Primary / secondary / ghost actions |
| `Badge` | Status labels, count indicators |
| `Card` | Bordered container |
| `Chip` | Removable tag |
| `CircularScore` | Donut score indicator |
| `EmptyState` | Empty list / zero-data placeholder |
| `ErrorState` | Error display |
| `IconBtn` | Icon-only button |
| `Kbd` | Keyboard shortcut display |
| `Markdown` | Rendered markdown |
| `MonoLink` | Monospace hyperlink |
| `ProgressBar` | Linear progress |
| `SectionLabel` | Section heading |
| `Skeleton` | Loading placeholder |
| `Toggle` | On/off switch |
| `Avatar` | User avatar |
| `ConfidenceNum` | Confidence score display |

### `kit/` — form controls and complex widgets

Interactive, controlled components. Require React state.

| Component | Purpose |
|---|---|
| `TextInput` | Text field |
| `Textarea` | Multi-line text |
| `SelectInput` | Single-select dropdown |
| `SearchableSelect` | Filtered searchable select |
| `Checkbox` | Checkbox |
| `FormField` | Label + input + error wrapper |
| `Modal` | Dialog overlay |
| `Drawer` | Side panel |
| `Dropdown` | Context menu / popover |
| `Tabs` | Tabbed navigation |

### `shell/` — app frame and navigation

Used by `src/components/app-shell/` to compose the app layout.

| Component | Purpose |
|---|---|
| `AppFrame` | Root layout grid |
| `Sidebar` | Left navigation sidebar |
| `Topbar` | Top bar |
| `NavItem` | Sidebar navigation link |
| `RepoSwitcher` | Repository selector |
| `DefaultLink` | Navigation-aware link |

### `charts/` — data visualization (client-only)

Must be used with `"use client"` or dynamic import — recharts uses browser APIs.

| Component | Purpose |
|---|---|
| `LineChart` | Time-series line chart |
| `BarRow` | Horizontal bar |
| `Donut` | Donut chart |
| `MetricCard` | Single metric with sparkline |
| `Sparkline` | Mini inline chart |

### `command-palette/`

| Component | Purpose |
|---|---|
| `CommandPalette` | App-wide search and command palette |
| `ShortcutsHelp` | Keyboard shortcuts reference |

## Rules

**Adding new primitives:**
- Add to the appropriate sub-directory (`primitives/` or `kit/`).
- No domain knowledge — no imports from `lib/`, no API calls.
- Export from the sub-directory's `index.ts` and from the root `vendor/ui/index.ts`.

**Do not:**
- Add business-logic-aware components to `vendor/ui/` — those belong in `src/components/`.
- Import a sub-directory directly: `from '@/vendor/ui/primitives'` — always use the root barrel.
- Add Tailwind classes that reference app-specific design tokens not in `vendor/ui/styles.css`.

## `icons.tsx`

SVG icons as named React components. Import from the root barrel:
```ts
import { ChevronDown, SearchIcon } from '@/vendor/ui'
```

## Design tokens

Base tokens (colors, spacing, typography) are in `vendor/ui/tokens.ts` and `vendor/ui/styles.css`.
Reference tokens when adding new primitives instead of hardcoding Tailwind class strings.
