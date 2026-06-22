import { NextResponse } from 'next/server';
import { EditCandidateGeometryRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { reviewService } from '@/server/modules/review';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** PATCH /v1/measurements/{id}/geometry — edit a candidate's geometry, recomputing its quantity. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const body = await parseBody(request, EditCandidateGeometryRequest);
    const measurement = await withOrgScope(getAppDb(), orgId, (tx) =>
      reviewService.editGeometry(tx, id, body.geometry, { userId, role }),
    );
    return NextResponse.json({ measurement });
  });
}
