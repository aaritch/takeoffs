import { z } from 'zod';
import { PlanSetProcessingStatus } from '../enums/projects';

/** Plan-set HTTP shapes (P1-01). A plan set is a version of a project's drawings. */

/** POST /v1/projects/{id}/plan-sets — start a new plan-set version. */
export const CreatePlanSetRequest = z.object({
  label: z.string().max(200).optional(),
});
export type CreatePlanSetRequest = z.infer<typeof CreatePlanSetRequest>;

export const PlanSetView = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  label: z.string().nullable(),
  sourceFileCount: z.number().int().nonnegative(),
  totalSheetCount: z.number().int().nonnegative(),
  processingStatus: PlanSetProcessingStatus,
  createdAt: z.string().datetime(),
});
export type PlanSetView = z.infer<typeof PlanSetView>;

export const CreatePlanSetResponse = z.object({ planSet: PlanSetView });
export type CreatePlanSetResponse = z.infer<typeof CreatePlanSetResponse>;
