import { z } from 'zod';
import { Traceable } from '../observability';

/**
 * Per-sheet AI inference job (P2-02/03). The app plane enqueues one of these per sheet when a
 * ModelRun starts; the inference plane (Python, GPU) drains it, runs the staged pipeline (P2-01
 * contracts), and returns a SheetInferenceResult the app ingests as candidate measurements. The
 * pinned versions ride on the job so every run's lineage is reproducible (spec §7.4). Idempotent:
 * re-running a sheet replaces its prior candidate set under the new run, never duplicates.
 */
export const INFERENCE_QUEUE = 'jobs:inference';

export const InferenceJob = Traceable.extend({
  modelRunId: z.string().uuid(),
  orgId: z.string().uuid(),
  sheetId: z.string().uuid(),
  planSetId: z.string().uuid(),
  pipelineVersion: z.string().min(1),
  /** Map of model name → pinned version for this run. */
  modelVersions: z.record(z.string(), z.string()),
});
export type InferenceJob = z.infer<typeof InferenceJob>;
