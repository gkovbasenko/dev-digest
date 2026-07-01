---
name: testing
description: Test setup, file placement, and patterns for client/ components
metadata:
  tags: testing, vitest, react-testing-library, jsdom
---

# Testing

## Stack

- **Test runner:** vitest 2.1
- **Environment:** jsdom
- **UI testing:** @testing-library/react
- **Events:** `fireEvent` from `@testing-library/react` — `userEvent` is **not installed**
- **Setup file:** `client/src/test/setup.ts`

## File placement

Tests are colocated with the component they test:

```
FindingsPanel/
├── FindingsPanel.tsx
├── FindingsPanel.test.tsx   ← colocated
└── index.ts
```

Plain utility functions tested separately use `.test.ts` (no `x`):
```
FindingsTab/
├── runFindingsPreview.ts
└── runFindingsPreview.test.ts
```

Root-level smoke tests live in `src/test/smoke.test.tsx`.

## What to test

- Component rendering with different prop combinations
- User interactions (clicks, form input) and resulting state/output changes
- Pure helper functions in `helpers.ts`
- Edge cases: empty states, error states, loading states

Don't test internal implementation details, Tailwind class strings, or library behavior.

## Basic component test pattern

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { FindingsPanel } from './FindingsPanel'

describe('FindingsPanel', () => {
  it('shows empty state when no findings', () => {
    render(<FindingsPanel findings={[]} />)
    expect(screen.getByText('No findings')).toBeInTheDocument()
  })

  it('calls onSelect when a finding is clicked', () => {
    const onSelect = vi.fn()
    render(<FindingsPanel findings={mockFindings} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Finding title'))
    expect(onSelect).toHaveBeenCalledWith(mockFindings[0])
  })
})
```

## Mocking hooks

Mock TanStack Query hooks at the module level:
```tsx
vi.mock('@/lib/hooks', () => ({
  usePullRequest: vi.fn(),
}))

import { usePullRequest } from '@/lib/hooks'

beforeEach(() => {
  vi.mocked(usePullRequest).mockReturnValue({
    data: mockPr,
    isPending: false,
    isError: false,
  } as any)
})
```

## No `userEvent` — use `fireEvent`

```tsx
// ✗ not installed
import userEvent from '@testing-library/user-event'
await userEvent.click(button)

// ✓ use this instead
import { fireEvent } from '@testing-library/react'
fireEvent.click(button)
fireEvent.change(input, { target: { value: 'text' } })
```

## Running tests

From `client/`:
```sh
pnpm test               # watch mode
pnpm test --run         # single pass (CI)
pnpm test FindingsPanel # filter by name
```
