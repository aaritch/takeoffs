import { z } from 'zod';
import { ModelRunStatus, ModelRunTrigger } from '../enums';

/** POST /v1/plan-sets/{id}/model-runs — start an AI run over the plan set (enqueues per-sheet jobs). */
export const StartModelRunRequest = z.object({
  trigger: ModelRunTrigger.optional(),
});
export type StartModelRunRequest = z.infer<typeof StartModelRunRequest>;

/** A ModelRun and its lineage/status (spec §5.4). The client polls `status` until terminal. */
export const ModelRunView = z.object({
  id: z.string().uuid(),
  planSetId: z.string().uuid(),
  sheetId: z.string().uuid().nullable(),
  status: ModelRunStatus,
  trigger: ModelRunTrigger,
  pipelineVersion: z.string(),
  modelVersions: z.record(z.string(), z.string()),
  candidateCount: z.number().int().nonnegative(),
  errorDetail: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ModelRunView = z.infer<typeof ModelRunView>;

export const StartModelRunResponse = z.object({ modelRun: ModelRunView });
export type StartModelRunResponse = z.infer<typeof StartModelRunResponse>;

export const ModelRunsListResponse = z.object({ modelRuns: z.array(ModelRunView) });
export type ModelRunsListResponse = z.infer<typeof ModelRunsListResponse>;
