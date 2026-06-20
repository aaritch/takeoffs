import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { measurementToView, measurementsRepo } from '@/server/modules/measurements';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/sheets/{id}/measurements — all measurements on the sheet, for the viewer overlay. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const measurements = await withOrgScope(getAppDb(), orgId, async (tx) =>
      (await measurementsRepo.listBySheet(tx, id)).map(measurementToView),
    );
    return NextResponse.json({ measurements });
  });
}
