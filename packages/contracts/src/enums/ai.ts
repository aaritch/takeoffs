import { z } from 'zod';

/** What triggered an AI pipeline run (spec §5.4, ModelRun.trigger). */
export const ModelRunTrigger = z.enum(['AUTO_ON_UPLOAD', 'USER_REQUESTED', 'REPROCESS']);
export type ModelRunTrigger = z.infer<typeof ModelRunTrigger>;

/**
 * AI pipeline run status (spec §5.4, ModelRun.status). The pipeline tolerates partial
 * failure: if one stage fails for one sheet, the rest still produce results (spec §7.4).
 * QUEUED → RUNNING → SUCCEEDED | FAILED | PARTIAL.
 */
export const ModelRunStatus = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL']);
export type ModelRunStatus = z.infer<typeof ModelRunStatus>;

/**
 * Model version lifecycle in the registry (spec §7.4, P4-06). CANDIDATE (evaluated, not serving) →
 * ACTIVE (the served version, one per family) → RETIRED (superseded by a promotion) or ROLLED_BACK
 * (reverted from active). Promotion requires non-regression against the frozen benchmark; rollback is
 * a version switch, not a redeploy.
 */
export const ModelVersionStatus = z.enum(['CANDIDATE', 'ACTIVE', 'RETIRED', 'ROLLED_BACK']);
export type ModelVersionStatus = z.infer<typeof ModelVersionStatus>;

/**
 * A captured human correction of an AI candidate (spec §5.4, DetectionFeedback.action) —
 * the training signal for the flywheel (spec §7.6).
 * - ACCEPT / REJECT: confirm or discard a candidate.
 * - EDIT_GEOMETRY: keep the candidate but change its geometry.
 * - RECLASSIFY: change the candidate's predicted class/condition.
 * - ADD_MISSED: a human added a measurement the AI did not propose (coverage signal).
 */
export const FeedbackAction = z.enum([
  'ACCEPT',
  'REJECT',
  'EDIT_GEOMETRY',
  'RECLASSIFY',
  'ADD_MISSED',
]);
export type FeedbackAction = z.infer<typeof FeedbackAction>;

/**
 * The ordered AI pipeline stages (spec §7.2, Project-Plan §3 slugs). Each stage has a fixed
 * input/output contract (`STAGE_CONTRACTS`) so models can be swapped without touching the
 * orchestration (spec §7.3). The slugs map 1:1 to the spec's ten stages:
 * CLASSIFY → OCR → SCALE → LINES → REGIONS → SYMBOLS → VECTORIZE → MAP → QUANTIFY → CONFIDENCE.
 */
export const StageName = z.enum([
  'CLASSIFY',
  'OCR',
  'SCALE',
  'LINES',
  'REGIONS',
  'SYMBOLS',
  'VECTORIZE',
  'MAP',
  'QUANTIFY',
  'CONFIDENCE',
]);
export type StageName = z.infer<typeof StageName>;

/** Canonical execution order of the stages. */
export const STAGE_ORDER: readonly StageName[] = [
  'CLASSIFY',
  'OCR',
  'SCALE',
  'LINES',
  'REGIONS',
  'SYMBOLS',
  'VECTORIZE',
  'MAP',
  'QUANTIFY',
  'CONFIDENCE',
];

/** Sheet page type predicted by the classification stage (spec §7.2 stage 1). */
export const PageType = z.enum([
  'PLAN',
  'ELEVATION',
  'SECTION',
  'DETAIL',
  'SCHEDULE',
  'TITLE',
  'UNKNOWN',
]);
export type PageType = z.infer<typeof PageType>;

/** How the scale-detection stage derived a scale candidate (spec §7.2 stage 3). */
export const ScaleSource = z.enum(['NOTATION', 'GRAPHIC_BAR', 'DIMENSION_STRING']);
export type ScaleSource = z.infer<typeof ScaleSource>;
