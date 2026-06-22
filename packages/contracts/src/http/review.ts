import { z } from 'zod';
import { MeasurementGeometry } from '../measurements';
import { MeasurementView } from './measurements';

/**
 * Candidate review action contracts (P2-10). Accept/reject carry no body. Each action returns the
 * updated measurement; the authoritative rollup is recomputed server-side and read separately.
 */

/** PATCH /v1/measurements/{id}/geometry — edit a candidate's geometry (recomputes its quantity). */
export const EditCandidateGeometryRequest = z.object({ geometry: MeasurementGeometry });
export type EditCandidateGeometryRequest = z.infer<typeof EditCandidateGeometryRequest>;

/** POST /v1/measurements/{id}/reclassify — move a candidate to a different condition. */
export const ReclassifyCandidateRequest = z.object({ conditionId: z.string().uuid() });
export type ReclassifyCandidateRequest = z.infer<typeof ReclassifyCandidateRequest>;

/** POST /v1/conditions/{id}/missed — add a measurement the AI missed (coverage signal). */
export const AddMissedRequest = z.object({
  sheetId: z.string().uuid(),
  geometry: MeasurementGeometry,
});
export type AddMissedRequest = z.infer<typeof AddMissedRequest>;

/** POST /v1/conditions/{id}/candidates/accept — bulk-accept candidates at/above a confidence. */
export const BulkAcceptRequest = z.object({ minConfidence: z.number().min(0).max(1) });
export type BulkAcceptRequest = z.infer<typeof BulkAcceptRequest>;

export const ReviewActionResponse = z.object({ measurement: MeasurementView });
export type ReviewActionResponse = z.infer<typeof ReviewActionResponse>;

export const BulkAcceptResponse = z.object({ accepted: z.number().int().nonnegative() });
export type BulkAcceptResponse = z.infer<typeof BulkAcceptResponse>;
