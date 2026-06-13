import { z } from 'zod';

/**
 * Takeoff lifecycle (spec §5.3, Takeoff.status).
 * DRAFT → IN_REVIEW → FINAL. A takeoff is bound to a specific plan-set version.
 */
export const TakeoffStatus = z.enum(['DRAFT', 'IN_REVIEW', 'FINAL']);
export type TakeoffStatus = z.infer<typeof TakeoffStatus>;

/** How a takeoff originated (spec §5.3, Takeoff.origin). */
export const TakeoffOrigin = z.enum(['SELF_SERVE', 'MANAGED_SERVICE']);
export type TakeoffOrigin = z.infer<typeof TakeoffOrigin>;

/**
 * What a condition measures (spec §5.3, Condition.measurement_type).
 * VOLUME and SURFACE_AREA are typically derived from a 2D base + depth_or_height (spec §6.5).
 */
export const MeasurementType = z.enum(['LINEAR', 'AREA', 'COUNT', 'VOLUME', 'SURFACE_AREA']);
export type MeasurementType = z.infer<typeof MeasurementType>;

/**
 * The physical dimension a measurement type resolves to. Quantities are stored in a single
 * canonical base unit per dimension (feet / square feet / cubic feet; counts are exact) and
 * converted for display/export (spec §9).
 */
export const QuantityDimension = z.enum(['LENGTH', 'AREA', 'VOLUME', 'COUNT']);
export type QuantityDimension = z.infer<typeof QuantityDimension>;

/**
 * Condition display unit codes (spec §5.3 / §9; examples: LF, SF, EA, CY, SY). This is the
 * standard launch set — the final per-trade unit list is a domain-estimator decision in
 * P0-10 and may expand. Each unit maps to one {@link QuantityDimension}.
 * - LF: linear feet · SF: square feet · SY: square yards
 * - CY: cubic yards · CF: cubic feet · EA: each (count)
 */
export const Unit = z.enum(['LF', 'SF', 'SY', 'CY', 'CF', 'EA']);
export type Unit = z.infer<typeof Unit>;

/** Dimension each unit belongs to — drives valid unit choices per measurement type. */
export const UNIT_DIMENSION: Readonly<Record<Unit, QuantityDimension>> = {
  LF: 'LENGTH',
  SF: 'AREA',
  SY: 'AREA',
  CY: 'VOLUME',
  CF: 'VOLUME',
  EA: 'COUNT',
};

/** The physical dimension each measurement type resolves to. SURFACE_AREA is an area. */
export const MEASUREMENT_TYPE_DIMENSION: Readonly<Record<MeasurementType, QuantityDimension>> = {
  LINEAR: 'LENGTH',
  AREA: 'AREA',
  COUNT: 'COUNT',
  VOLUME: 'VOLUME',
  SURFACE_AREA: 'AREA',
};

/** Whether a unit is valid for a measurement type (their dimensions must match). */
export function isUnitValidFor(measurementType: MeasurementType, unit: Unit): boolean {
  return UNIT_DIMENSION[unit] === MEASUREMENT_TYPE_DIMENSION[measurementType];
}

/** Geometric kind of a measurement (spec §5.3, Measurement.geom_type). */
export const GeometryType = z.enum(['POLYLINE', 'POLYGON', 'POINT', 'POINT_GROUP']);
export type GeometryType = z.infer<typeof GeometryType>;

/**
 * Provenance of a measurement (spec §5.3, Measurement.source).
 * - AI: emitted by the inference pipeline.
 * - MANUAL: drawn by a human.
 * - AI_EDITED: AI candidate a human modified.
 */
export const MeasurementSource = z.enum(['AI', 'MANUAL', 'AI_EDITED']);
export type MeasurementSource = z.infer<typeof MeasurementSource>;

/**
 * Human review state of a measurement (spec §5.3, Measurement.review_status). AI candidates
 * start UNREVIEWED; every review action also writes DetectionFeedback (spec §7.5).
 */
export const ReviewStatus = z.enum(['UNREVIEWED', 'ACCEPTED', 'REJECTED', 'EDITED']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;
