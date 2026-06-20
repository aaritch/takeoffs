import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { reportToView, reportsService } from '@/server/modules/reports';
import { NotFound } from '@/server/modules/source-files';
import { getStorage } from '@/server/storage';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/reports/{id} — poll a report's status; includes a signed download URL once READY. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const report = await withOrgScope(getAppDb(), orgId, (tx) => reportsService.getById(tx, id));
    if (!report) throw NotFound('Report not found');
    const view = await reportToView(getStorage(), report);
    return NextResponse.json({ report: view });
  });
}
