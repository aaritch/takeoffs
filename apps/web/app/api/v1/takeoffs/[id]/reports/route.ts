import { NextResponse } from 'next/server';
import { CreateReportRequest, EXPORT_QUEUE } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { reportToView, reportsService } from '@/server/modules/reports';
import { enqueue } from '@/server/platform/queue';
import { getStorage } from '@/server/storage';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/takeoffs/{id}/reports — request a report export (P1-13). The request path only creates
 * the QUEUED row and enqueues the job (202); the worker-exports process renders it. Enqueue happens
 * AFTER the tx commits so the worker can't race the row.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: takeoffId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, CreateReportRequest);
    const report = await withOrgScope(getAppDb(), orgId, (tx) =>
      reportsService.requestReport(tx, { takeoffId, template: body.template }),
    );
    await enqueue(EXPORT_QUEUE, {
      reportId: report.id,
      takeoffId,
      orgId,
      template: report.template,
    });
    const view = await reportToView(getStorage(), report);
    return NextResponse.json({ report: view }, { status: 202 });
  });
}

/** GET /v1/takeoffs/{id}/reports — list this takeoff's exports (newest first) with signed URLs. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: takeoffId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const reports = await withOrgScope(getAppDb(), orgId, (tx) =>
      reportsService.listByTakeoff(tx, takeoffId),
    );
    const storage = getStorage();
    const views = await Promise.all(reports.map((r) => reportToView(storage, r)));
    return NextResponse.json({ reports: views });
  });
}
