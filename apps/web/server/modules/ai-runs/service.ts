import type {
  ModelRunStatus,
  ModelRunTrigger,
  ModelRunView,
  SheetInferenceResult,
} from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { planSetsRepo } from '../source-files/repository';
import { NotFound } from '../source-files/errors';
import { ingestSheetCandidates } from './ingest';
import { modelRunsRepo, type ModelRun } from './repository';

/**
 * The pipeline version stamped on a run today. Until the model registry lands (P2-02, GPU host),
 * runs use this skeleton version and an empty model-version map; the inference plane will supply
 * the real pinned versions per run.
 */
export const CURRENT_PIPELINE_VERSION = '0.0.0-skeleton';

export interface StartModelRunInput {
  planSetId: string;
  trigger?: ModelRunTrigger;
  pipelineVersion: string;
  modelVersions?: Record<string, string>;
}

export function modelRunToView(run: ModelRun): ModelRunView {
  return {
    id: run.id,
    planSetId: run.plan_set_id,
    sheetId: run.sheet_id,
    status: run.status,
    trigger: run.trigger,
    pipelineVersion: run.pipeline_version,
    modelVersions: run.model_versions,
    candidateCount: run.candidate_count,
    errorDetail: run.error_detail,
    startedAt: run.started_at?.toISOString() ?? null,
    finishedAt: run.finished_at?.toISOString() ?? null,
    createdAt: run.created_at.toISOString(),
  };
}

export const aiRunsService = {
  /** Create a QUEUED run over a plan set. The caller enqueues per-sheet InferenceJobs after commit. */
  async startRun(tx: OrgScopedTx, input: StartModelRunInput): Promise<ModelRun> {
    const planSet = await planSetsRepo.getById(tx, input.planSetId);
    if (!planSet) throw NotFound('Plan set not found');
    return modelRunsRepo.insert(tx, {
      org_id: await currentOrgId(tx),
      plan_set_id: input.planSetId,
      trigger: input.trigger ?? 'USER_REQUESTED',
      pipeline_version: input.pipelineVersion,
      model_versions: input.modelVersions ?? {},
      status: 'QUEUED',
    });
  },

  /** Mark a run RUNNING (idempotent), stamping started_at the first time. */
  async markRunning(tx: OrgScopedTx, runId: string): Promise<ModelRun> {
    const run = await modelRunsRepo.getById(tx, runId);
    if (!run) throw NotFound('Model run not found');
    if (run.status !== 'QUEUED') return run;
    return (await modelRunsRepo.update(tx, runId, {
      status: 'RUNNING',
      started_at: run.started_at ?? new Date(),
    }))!;
  },

  /**
   * Ingest one sheet's result into a run: write its candidates and bump the run's candidate count
   * (moving QUEUED → RUNNING on the first sheet). Returns the candidates written for the sheet.
   */
  async ingestSheetResult(tx: OrgScopedTx, result: SheetInferenceResult): Promise<number> {
    const run = await modelRunsRepo.getById(tx, result.modelRunId);
    if (!run) throw NotFound('Model run not found');
    const count = await ingestSheetCandidates(tx, result);
    await modelRunsRepo.update(tx, run.id, {
      status: run.status === 'QUEUED' ? 'RUNNING' : run.status,
      started_at: run.started_at ?? new Date(),
      candidate_count: run.candidate_count + count,
    });
    return count;
  },

  /** Finalize a run to a terminal status (SUCCEEDED | PARTIAL | FAILED), stamping finished_at. */
  async finalizeRun(
    tx: OrgScopedTx,
    runId: string,
    status: Extract<ModelRunStatus, 'SUCCEEDED' | 'PARTIAL' | 'FAILED'>,
    errorDetail?: string,
  ): Promise<ModelRun> {
    const run = await modelRunsRepo.update(tx, runId, {
      status,
      finished_at: new Date(),
      ...(errorDetail !== undefined ? { error_detail: errorDetail } : {}),
    });
    if (!run) throw NotFound('Model run not found');
    return run;
  },

  getById(tx: OrgScopedTx, id: string): Promise<ModelRun | undefined> {
    return modelRunsRepo.getById(tx, id);
  },

  listByPlanSet(tx: OrgScopedTx, planSetId: string): Promise<ModelRun[]> {
    return modelRunsRepo.listByPlanSet(tx, planSetId);
  },
};
