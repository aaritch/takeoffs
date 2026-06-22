import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { aiRunsService, modelRunToView } from '@/server/modules/ai-runs';
import { NotFound } from '@/server/modules/source-files';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/model-runs/{id} — poll an AI run's status, lineage, and candidate count. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const run = await withOrgScope(getAppDb(), orgId, (tx) => aiRunsService.getById(tx, id));
    if (!run) throw NotFound('Model run not found');
    return NextResponse.json({ modelRun: modelRunToView(run) });
  });
}
