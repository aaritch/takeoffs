import { z } from 'zod';
import { GeometryType, MeasurementSource, ReviewStatus, ScaleUnits } from '../enums';
import { MeasurementGeometry, Point } from '../measurements';

/**
 * Measurement + scale HTTP shapes (P1-09). The client submits only GEOMETRY (normalized sheet
 * coordinates) — never a quantity total or the scale; the server computes the real-world value
 * from the sheet's confirmed scale (server-authoritative quantities, spec §4.10).
 */

/** POST /v1/sheets/{id}/scale — two-point manual calibration sets the sheet's scale. */
export const CalibrateScaleRequest = z.object({
  p1: Point,
  p2: Point,
  realLength: z.number().positive(),
  lengthUnit: z.enum(['FEET', 'INCHES', 'YARDS', 'METERS']),
  units: ScaleUnits,
});
export type CalibrateScaleRequest = z.infer<typeof CalibrateScaleRequest>;

/** POST /v1/conditions/{id}/measurements — attach a new measurement to the active condition. */
export const CreateMeasurementRequest = z.object({
  sheetId: z.string().uuid(),
  geometry: MeasurementGeometry,
});
export type CreateMeasurementRequest = z.infer<typeof CreateMeasurementRequest>;

export const MeasurementView = z.object({
  id: z.string().uuid(),
  conditionId: z.string().uuid(),
  sheetId: z.string().uuid().nullable(),
  geomType: GeometryType,
  geometry: MeasurementGeometry,
  /** Server-computed real-world value (feet / sq ft / count) before condition factors. */
  rawValue: z.number(),
  source: MeasurementSource,
  reviewStatus: ReviewStatus,
  /** AI candidate confidence in [0, 1]; null for manual measurements. */
  aiConfidence: z.number().min(0).max(1).nullable(),
  /** The run that produced this candidate; null for manual measurements. */
  modelRunId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type MeasurementView = z.infer<typeof MeasurementView>;

export const CreateMeasurementResponse = z.object({ measurement: MeasurementView });
export type CreateMeasurementResponse = z.infer<typeof CreateMeasurementResponse>;
