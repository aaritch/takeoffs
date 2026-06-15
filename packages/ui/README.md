# @takeoff/ui

The design system: **tokens** + **primitive components**. Source-consumed React (transpiled by
the Next app, like the other internal packages). The plan's "viewer primitives" (tile canvas,
vector overlay) join here when the viewer is built (P1-06/07).

## Usage

Import the stylesheet once at the app root (Next.js: in `app/layout.tsx`):

```ts
import '@takeoff/ui/styles.css';
```

Then use the components and tokens:

```tsx
import { Button, Card, Badge, Stack, tokens } from '@takeoff/ui';

<Card title="Conditions">
  <Stack gap="sm">
    <Badge tone="primary">Draft</Badge>
    <Button variant="primary">Add condition</Button>
  </Stack>
</Card>;
```

## Contents

- **`tokens`** — colors, spacing, radii, font sizes (the programmatic source of truth; mirrored
  as CSS custom properties in `styles.css`).
- **`cn(...)`** — tiny classnames helper.
- **`Button`** (variant: primary/secondary/ghost, size: sm/md), **`Card`** (optional title),
  **`Badge`** (tone: neutral/primary/danger), **`Stack`** (row/column + token gap).
- **Forms:** **`Field`** (label + hint + error, with a11y wiring), **`Input`**, **`Textarea`**,
  **`Select`**, **`Checkbox`** (all support an `invalid` state via `aria-invalid`).

Components are presentational (class-name based; styles live in `styles.css`) so they render in
both server and client components. Tests run under jsdom via Vitest.
