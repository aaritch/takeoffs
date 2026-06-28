import { NextResponse } from 'next/server';
import { getDb } from '@/server/data/client';
import { opsDashboardService } from '@/server/modules/service-ops';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/ops/estimators — per-estimator capacity load for the ops dashboard (P3-08). */
export async function GET(request: Request, ctx: object) {
  void ctx;
  return platformHandler(
    request,
    async () => {
      const estimators = await opsDashboardService.estimatorLoad(getDb());
      return NextResponse.json({ estimators });
    },
    { roles: ['PLATFORM_ADMIN', 'SERVICE_QA'] },
  );
}
