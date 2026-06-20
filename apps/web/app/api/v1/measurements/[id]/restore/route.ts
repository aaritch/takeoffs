import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { measurementToView, measurementsService } from '@/server/modules/measurements';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/measurements/{id}/restore — reverse a soft-delete (undo-delete / redo-create, P1-12). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const { measurement } = await withOrgScope(getAppDb(), orgId, (tx) =>
      measurementsService.restore(tx, id),
    );
    return NextResponse.json({ measurement: measurementToView(measurement) });
  });
}
