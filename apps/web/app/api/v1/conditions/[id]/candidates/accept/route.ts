import { NextResponse } from 'next/server';
import { BulkAcceptRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { reviewService } from '@/server/modules/review';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/conditions/{id}/candidates/accept — bulk-accept this condition's UNREVIEWED AI
 * candidates at or above `minConfidence`, leaving the rest unreviewed (P2-10).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: conditionId } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const body = await parseBody(request, BulkAcceptRequest);
    const accepted = await withOrgScope(getAppDb(), orgId, (tx) =>
      reviewService.bulkAcceptByConfidence(tx, conditionId, body.minConfidence, { userId, role }),
    );
    return NextResponse.json({ accepted });
  });
}
