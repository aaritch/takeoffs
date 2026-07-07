import { NextResponse } from 'next/server';
import { INFERENCE_QUEUE, StartModelRunRequest } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { CURRENT_PIPELINE_VERSION, aiRunsService, modelRunToView } from '@/server/modules/ai-runs';
import { modelRegistryService } from '@/server/modules/model-registry';
import { sheetsRepo } from '@/server/modules/ingestion';
import { enqueue } from '@/server/platform/queue';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/plan-sets/{id}/model-runs — start an AI run over the plan set (P2-02/03). Creates the
 * QUEUED ModelRun, then enqueues one per-sheet InferenceJob (drained by the inference plane / GPU
 * host). The request path only enqueues + returns the run; inference is a background job (202).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: planSetId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, StartModelRunRequest);
    // Stamp the serving model versions (the ACTIVE row per family, P4-06) onto the run, so every run
    // records exactly which versions produced it — the audit trail a rollback relies on. Resolved on
    // the admin connection (platform-global registry) before the org-scoped run insert.
    const modelVersions = await modelRegistryService.activeServingVersions(getDb());
    const { run, sheetIds } = await withOrgScope(getAppDb(), orgId, async (tx) => {
      const created = await aiRunsService.startRun(tx, {
        planSetId,
        ...(body.trigger ? { trigger: body.trigger } : {}),
        pipelineVersion: CURRENT_PIPELINE_VERSION,
        modelVersions,
      });
      const sheets = await sheetsRepo.listByPlanSet(tx, planSetId);
      return { run: created, sheetIds: sheets.map((s) => s.id) };
    });

    for (const sheetId of sheetIds) {
      await enqueue(INFERENCE_QUEUE, {
        modelRunId: run.id,
        orgId,
        sheetId,
        planSetId,
        pipelineVersion: run.pipeline_version,
        modelVersions: run.model_versions,
      });
    }
    return NextResponse.json({ modelRun: modelRunToView(run) }, { status: 202 });
  });
}

/** GET /v1/plan-sets/{id}/model-runs — list this plan set's AI runs (newest first). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: planSetId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const runs = await withOrgScope(getAppDb(), orgId, (tx) =>
      aiRunsService.listByPlanSet(tx, planSetId),
    );
    return NextResponse.json({ modelRuns: runs.map(modelRunToView) });
  });
}
