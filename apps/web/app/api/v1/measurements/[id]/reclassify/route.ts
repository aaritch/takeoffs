import { NextResponse } from 'next/server';
import { ReclassifyCandidateRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { reviewService } from '@/server/modules/review';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/measurements/{id}/reclassify — move a candidate to a different condition (P2-10). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const body = await parseBody(request, ReclassifyCandidateRequest);
    const measurement = await withOrgScope(getAppDb(), orgId, (tx) =>
      reviewService.reclassify(tx, id, body.conditionId, { userId, role }),
    );
    return NextResponse.json({ measurement });
  });
}
