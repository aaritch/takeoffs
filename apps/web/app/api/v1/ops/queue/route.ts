import { NextResponse } from 'next/server';
import { getDb } from '@/server/data/client';
import { opsDashboardService } from '@/server/modules/service-ops';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * GET /v1/ops/queue — the internal ops order queue across all orgs, with SLA status per order
 * (P3-08). Platform staff only. Poll for a live view.
 */
export async function GET(request: Request, ctx: object) {
  void ctx;
  return platformHandler(
    request,
    async () => {
      const orders = await opsDashboardService.queue(getDb(), new Date());
      return NextResponse.json({ orders });
    },
    { roles: ['PLATFORM_ADMIN', 'SERVICE_QA', 'SERVICE_ESTIMATOR'] },
  );
}
