import { z } from 'zod';

/** Project type (spec §5.2, Project.project_type). */
export const ProjectType = z.enum(['RESIDENTIAL', 'COMMERCIAL', 'SITEWORK', 'MIXED']);
export type ProjectType = z.infer<typeof ProjectType>;

/**
 * Project lifecycle (spec §5.2, Project.status). Reflects the bid's progress; not strictly
 * linear (a project may be ARCHIVED from any state). Provisional flow:
 * OPEN → BIDDING → SUBMITTED → (WON | LOST); any → ARCHIVED.
 */
export const ProjectStatus = z.enum(['OPEN', 'BIDDING', 'SUBMITTED', 'WON', 'LOST', 'ARCHIVED']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/**
 * Plan-set processing status (spec §10.4, PlanSet.processing_status).
 * UPLOADING → PROCESSING → READY, or PARTIAL if some source files failed.
 */
export const PlanSetProcessingStatus = z.enum(['UPLOADING', 'PROCESSING', 'READY', 'PARTIAL']);
export type PlanSetProcessingStatus = z.infer<typeof PlanSetProcessingStatus>;

/**
 * Per-source-file ingestion status (spec §10.4, SourceFile.ingest_status). Linear pipeline;
 * any step may go to FAILED with error_detail. Each step is idempotent and resumable (§10.5).
 * PENDING → SCANNING → SPLITTING → RASTERIZING → TILING → EXTRACTING → PROCESSED | FAILED.
 */
export const IngestStatus = z.enum([
  'PENDING',
  'SCANNING',
  'SPLITTING',
  'RASTERIZING',
  'TILING',
  'EXTRACTING',
  'PROCESSED',
  'FAILED',
]);
export type IngestStatus = z.infer<typeof IngestStatus>;

/** Ordered ingest pipeline steps (excludes the terminal PROCESSED/FAILED states). */
export const INGEST_PIPELINE_ORDER = [
  'PENDING',
  'SCANNING',
  'SPLITTING',
  'RASTERIZING',
  'TILING',
  'EXTRACTING',
] as const;

/** Drawing discipline of a sheet (spec §5.2, Sheet.discipline). UNKNOWN until classified. */
export const Discipline = z.enum([
  'ARCHITECTURAL',
  'STRUCTURAL',
  'MECHANICAL',
  'ELECTRICAL',
  'PLUMBING',
  'CIVIL',
  'LANDSCAPE',
  'UNKNOWN',
]);
export type Discipline = z.infer<typeof Discipline>;

/**
 * Sheet scale calibration status (spec §5.2, Sheet.scale_status).
 * - UNSET: no scale yet — quantities are not trustworthy.
 * - AUTO: AI-detected, not yet human-confirmed — provisional, excluded from final reports.
 * - CONFIRMED: human-confirmed — quantities count toward final reports (the scale gate).
 */
export const ScaleStatus = z.enum(['UNSET', 'AUTO', 'CONFIRMED']);
export type ScaleStatus = z.infer<typeof ScaleStatus>;

/** Measurement system for a sheet's scale (spec §5.2, SheetScale.units). */
export const ScaleUnits = z.enum(['IMPERIAL', 'METRIC']);
export type ScaleUnits = z.infer<typeof ScaleUnits>;

/** How a sheet's scale was established (spec §5.2, SheetScale.calibration_method). */
export const CalibrationMethod = z.enum(['AI_DETECTED', 'TWO_POINT_MANUAL', 'SCALE_LABEL']);
export type CalibrationMethod = z.infer<typeof CalibrationMethod>;

/** Who set the scale (spec §5.2, SheetScale.set_by). */
export const ScaleSetBy = z.enum(['SYSTEM', 'USER']);
export type ScaleSetBy = z.infer<typeof ScaleSetBy>;
