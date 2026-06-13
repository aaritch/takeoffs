# @takeoff/contracts

The **single source of truth** for every shape that crosses a network boundary: HTTP
request/response bodies, real-time event payloads, background-job messages, and the shared
enumerations they reference. Every side of every boundary (Next.js app + API, workers,
realtime gateway, and — mirrored — the Python services) imports its shapes from here. No
service re-declares a shared shape locally.

## Rules (non-negotiable)

- **Zero business logic. Zero environment access.** This package is pure definitions. Any
  logic or config creeping in is a defect (see P0-02 caveats).
- **Validation + types from one definition.** Shapes are defined with [Zod](https://zod.dev),
  which produces both a runtime validator and a static type. Define once, infer the type:

  ```ts
  export const Thing = z.object({ id: z.string() });
  export type Thing = z.infer<typeof Thing>;
  ```

- **Single public surface.** Consumers import from the package root only
  (`@takeoff/contracts`), never deep paths (`@takeoff/contracts/src/...`) — enforced by ESLint.
- **Changes are deliberate.** A change to a shared shape is a reviewed contract change, not
  a casual edit.

## Consumption model

This is a **source-consumed internal package**: `exports` point at `src/index.ts`, and
consumers (Next.js, tsup/tsx-built workers) transpile the TypeScript directly. `build` and
`typecheck` therefore run `tsc --noEmit` — they validate types; there is no emitted `dist`.

## Layout

```
src/
├─ index.ts      public export surface (re-exports the four areas below)
├─ enums/        shared enumerations (filled in P0-03)
├─ http/         request/response shapes + the error envelope and pagination primitives
├─ events/       real-time event payloads (filled from Phase 1)
└─ jobs/         background-job message shapes (filled from Phase 1)
```

## Conventions

- Field names are `snake_case`; enum values are `UPPER_SNAKE_CASE` (spec §1).
- Money is integer minor units; timestamps are UTC ISO-8601 strings.
