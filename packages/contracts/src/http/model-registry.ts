import { z } from 'zod';
import { ModelVersionStatus } from '../enums/ai';

/**
 * Model registry (spec §7.4, P4-06) — register evaluated candidates, promote on non-regression, and
 * roll back by version switch. Metrics are per-metric (and per-class via `class.metric` keys), scored
 * against the frozen benchmark.
 */
export const ModelVersionView = z.object({
  id: z.string().uuid(),
  modelFamily: z.string(),
  version: z.string(),
  status: ModelVersionStatus,
  metrics: z.record(z.string(), z.number()),
  benchmarkId: z.string().nullable(),
  previousActiveId: z.string().uuid().nullable(),
  activatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ModelVersionView = z.infer<typeof ModelVersionView>;

/** POST /v1/ops/models — register an evaluated candidate model version. */
export const RegisterModelVersionRequest = z.object({
  modelFamily: z.string().min(1),
  version: z.string().min(1),
  metrics: z.record(z.string(), z.number()),
  benchmarkId: z.string().optional(),
  notes: z.string().optional(),
});
export type RegisterModelVersionRequest = z.infer<typeof RegisterModelVersionRequest>;

/** POST /v1/ops/models/{family}/promote — promote a candidate (blocked on any metric regression). */
export const PromoteModelRequest = z.object({ version: z.string().min(1) });
export type PromoteModelRequest = z.infer<typeof PromoteModelRequest>;

export const ModelVersionResponse = z.object({ model: ModelVersionView });
export type ModelVersionResponse = z.infer<typeof ModelVersionResponse>;

export const ModelVersionsResponse = z.object({ models: z.array(ModelVersionView) });
export type ModelVersionsResponse = z.infer<typeof ModelVersionsResponse>;
