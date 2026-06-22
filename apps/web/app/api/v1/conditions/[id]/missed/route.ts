import { NextResponse } from 'next/server';
import { AddMissedRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { reviewService } from '@/server/modules/review';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/conditions/{id}/missed — add a measurement the AI missed (coverage signal, P2-10). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: conditionId } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const body = await parseBody(request, AddMissedRequest);
    const measurement = await withOrgScope(getAppDb(), orgId, (tx) =>
      reviewService.addMissed(
        tx,
        { conditionId, sheetId: body.sheetId, geometry: body.geometry },
        { userId, role },
      ),
    );
    return NextResponse.json({ measurement }, { status: 201 });
  });
}
