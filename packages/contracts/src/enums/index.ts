// Shared enumerations — the canonical status and type enums from the spec (§2.2, §5, §10,
// §11). Every value is UPPER_SNAKE_CASE and documented with its meaning and, for state
// machines, its legal transitions. Defined once here as Zod enums (runtime validation +
// inferred types) so the API, client, workers, and (mirrored) Python services share them
// with no local re-declaration.
export * from './accounts';
export * from './projects';
export * from './takeoff';
export * from './ai';
export * from './orders';
export * from './billing';
export * from './notifications';
export * from './webhooks';
