import { NextResponse } from 'next/server';
import { CreatePlanSetRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { planSetToView, sourceFilesService } from '@/server/modules/source-files';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/projects/{id}/plan-sets — start a new plan-set version under the project. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId }) => {
    const body = await parseBody(request, CreatePlanSetRequest);
    const planSet = await withOrgScope(getAppDb(), orgId, (tx) =>
      sourceFilesService.createPlanSet(tx, {
        projectId,
        uploadedByUserId: userId,
        ...(body.label !== undefined ? { label: body.label } : {}),
      }),
    );
    return NextResponse.json({ planSet: planSetToView(planSet) }, { status: 201 });
  });
}
