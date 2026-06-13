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
