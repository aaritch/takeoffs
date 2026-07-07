// AI runs module (P2-02/03, app-plane core) — ModelRun lifecycle + AI candidate ingestion. Owns
// the durable run state and lineage, and turns a sheet's SheetInferenceResult (from the inference
// plane) into UNREVIEWED AI candidate measurements. Quantities stay server-authoritative (raw_value
// recomputed, never trusted from the model) and candidates never count toward rollups until a human
// accepts them. GPU model serving lives in apps/ai-inference (Phase-2 compute home).
export {
  aiRunsService,
  modelRunToView,
  CURRENT_PIPELINE_VERSION,
  deriveRunStatus,
} from './service';
export type { StartModelRunInput, TerminalRunStatus } from './service';
export { ingestSheetCandidates } from './ingest';
export { modelRunsRepo } from './repository';
export type { ModelRun } from './repository';
