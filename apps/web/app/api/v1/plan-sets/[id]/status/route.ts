import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { getPlanSetStatus } from '@/server/modules/source-files';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/plan-sets/{id}/status — granular per-file/per-sheet processing status (P1-05). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: planSetId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const status = await withOrgScope(getAppDb(), orgId, (tx) => getPlanSetStatus(tx, planSetId));
    return NextResponse.json(status);
  });
}
