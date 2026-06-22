import { z } from 'zod';
import { MeasurementGeometry } from '../measurements';
import {
  Discipline,
  MeasurementType,
  ModelRunStatus,
  PageType,
  ScaleSource,
  ScaleUnits,
  StageName,
  Unit,
} from '../enums';

/**
 * Shared building-block shapes for the AI pipeline stage contracts (P2-01). These are the seam
 * between the inference plane (Python) and the orchestration/API plane (TS): every stage's input
 * and output is built from these, so a model can change internally as long as it still produces
 * these shapes. All geometry is in normalized sheet coordinates (spec §9) — identical to manual
 * measurements — so candidates and hand-drawn measurements share one coordinate space.
 */

/** A confidence/probability in [0, 1]. */
export const Confidence = z.number().min(0).max(1);
export type Confidence = z.infer<typeof Confidence>;

/** The processed sheet image a detector runs on; w/h define its normalized coordinate space. */
export const SheetRef = z.object({
  sheetId: z.string().uuid(),
  /** Object-storage key of the working raster / tile pyramid root (org-namespaced). */
  rasterKey: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
});
export type SheetRef = z.infer<typeof SheetRef>;

/**
 * Provenance carried on every stage message: which run/sheet, which stage, and the exact pinned
 * versions — recorded on the ModelRun for full reproducibility (spec §7.4).
 */
export const StageEnvelope = z.object({
  modelRunId: z.string().uuid(),
  orgId: z.string().uuid(),
  sheetId: z.string().uuid(),
  stage: StageName,
  pipelineVersion: z.string().min(1),
  /** Map of model name → pinned version for this run. */
  modelVersions: z.record(z.string(), z.string()),
});
export type StageEnvelope = z.infer<typeof StageEnvelope>;

/** A normalized bounding box in sheet coordinates. */
export const BBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type BBox = z.infer<typeof BBox>;

/** A recognized text token with its position and confidence (OCR stage). */
export const OcrToken = z.object({
  text: z.string(),
  bbox: BBox,
  confidence: Confidence,
});
export type OcrToken = z.infer<typeof OcrToken>;

/** Sheet classification output: discipline + page type with confidence (stage 1). */
export const SheetClassification = z.object({
  discipline: Discipline,
  pageType: PageType,
  confidence: Confidence,
});
export type SheetClassification = z.infer<typeof SheetClassification>;

/** A scale candidate: feet/meters per normalized pixel, how it was found, and confidence (stage 3). */
export const ScaleCandidate = z.object({
  unitPerPixel: z.number().positive(),
  scaleUnits: ScaleUnits,
  source: ScaleSource,
  confidence: Confidence,
});
export type ScaleCandidate = z.infer<typeof ScaleCandidate>;

/**
 * A raw detection from a detector stage (lines/regions/symbols), before class→condition mapping.
 * `objectClass` is an open vocabulary (string) on purpose — the orchestration stays ignorant of
 * the model's class set; the MAP stage resolves classes to conditions (spec §7.3 caveat).
 */
export const Detection = z.object({
  geometry: MeasurementGeometry,
  objectClass: z.string().min(1),
  confidence: Confidence,
});
export type Detection = z.infer<typeof Detection>;

/** A detection mapped to a condition shape (measurement type + unit + grouping key) — stage 8. */
export const MappedCandidate = z.object({
  geometry: MeasurementGeometry,
  objectClass: z.string().min(1),
  measurementType: MeasurementType,
  unit: Unit,
  /** A stable key for the condition this candidate groups under (matched or proposed). */
  conditionKey: z.string().min(1),
  detectionConfidence: Confidence,
});
export type MappedCandidate = z.infer<typeof MappedCandidate>;

/** A mapped candidate with its real-world quantity applied from the sheet scale — stage 9. */
export const QuantifiedCandidate = MappedCandidate.extend({
  rawValue: z.number().nonnegative(),
});
export type QuantifiedCandidate = z.infer<typeof QuantifiedCandidate>;

/**
 * The final candidate after confidence assembly (stage 10) — written as a Measurement row with
 * source=AI, review_status=UNREVIEWED, ai_confidence=aiConfidence (spec §7.1).
 */
export const ScoredCandidate = QuantifiedCandidate.extend({
  aiConfidence: Confidence,
});
export type ScoredCandidate = z.infer<typeof ScoredCandidate>;

/**
 * The aggregate result of running the pipeline over one sheet — the candidates plus the scale and
 * classification context, and the run status (PARTIAL if a stage failed). Quantities from an
 * unconfirmed-scale sheet stay provisional and are excluded from final reports (the scale gate).
 */
export const SheetInferenceResult = z.object({
  modelRunId: z.string().uuid(),
  sheetId: z.string().uuid(),
  status: ModelRunStatus,
  classification: SheetClassification.nullable(),
  scale: ScaleCandidate.nullable(),
  candidates: z.array(ScoredCandidate),
  errorDetail: z.string().nullable(),
});
export type SheetInferenceResult = z.infer<typeof SheetInferenceResult>;
