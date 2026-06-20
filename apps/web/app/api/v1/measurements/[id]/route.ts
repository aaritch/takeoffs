import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { measurementsService } from '@/server/modules/measurements';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** DELETE /v1/measurements/{id} — remove a measurement and refresh its condition's rollup (P1-09). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    await withOrgScope(getAppDb(), orgId, (tx) => measurementsService.remove(tx, id));
    return NextResponse.json({ ok: true });
  });
}
