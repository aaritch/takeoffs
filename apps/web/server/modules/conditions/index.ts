// Conditions module (P1-10) — Condition CRUD with measurement-type/unit validation, explicit
// derivations (depth_or_height), waste, and optional costing. Per-condition quantity math lives
// in quantities.ts (pure, built on @takeoff/geometry); the persisted rollup over a measurement
// set is P1-11.
export { conditionsService } from './service';
export { listSheetConditions, createSheetCondition, resolveSheetTakeoff } from './sheet-conditions';
export type { CreateConditionInput, UpdateConditionInput } from './service';
export { computeConditionQuantities } from './quantities';
export type { ConditionFactors, ComputedQuantities } from './quantities';
export { ConditionError } from './errors';
export type { ConditionErrorCode } from './errors';
export type { Condition } from './repository';
