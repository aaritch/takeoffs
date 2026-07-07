import { z } from 'zod';

/**
 * Org-level training-data governance (P4-05). An org can opt OUT of having its review feedback used to
 * train models. The setting is the source of truth the offline dataset-assembly pipeline consumes to
 * exclude the org's data — capture stays lossless (P2-11); only training use is gated.
 */
export const TrainingPreferences = z.object({
  /** true = this org's feedback is NOT used for training. Default false (opted in). */
  trainingOptOut: z.boolean(),
});
export type TrainingPreferences = z.infer<typeof TrainingPreferences>;

export const TrainingPreferencesResponse = z.object({
  preferences: TrainingPreferences,
});
export type TrainingPreferencesResponse = z.infer<typeof TrainingPreferencesResponse>;

/** PATCH /v1/org/training-preferences — OWNER-gated. */
export const UpdateTrainingPreferencesRequest = z.object({
  trainingOptOut: z.boolean(),
});
export type UpdateTrainingPreferencesRequest = z.infer<typeof UpdateTrainingPreferencesRequest>;
