// Measurements module (P1-11) — create/edit/delete measurements (geometry only; the server
// computes the authoritative raw_value) and the server-authoritative QuantityRollup that is
// recomputed from the full measurement set on every change. The client never supplies a total.
export { measurementsService } from './service';
export type { CreateMeasurementInput, MeasurementResult } from './service';
export { computeRawValue } from './geometry';
export { recomputeRollup, getRollup } from './rollup';
export type { QuantityRollup } from './rollup';
export { measurementsRepo } from './repository';
export type { Measurement } from './repository';
export { MeasurementError } from './errors';
