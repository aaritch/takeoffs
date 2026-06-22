import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { reviewService } from '@/server/modules/review';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/measurements/{id}/reject — reject a candidate; it is excluded from the rollup (P2-10). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const measurement = await withOrgScope(getAppDb(), orgId, (tx) =>
      reviewService.reject(tx, id, { userId, role }),
    );
    return NextResponse.json({ measurement });
  });
}
