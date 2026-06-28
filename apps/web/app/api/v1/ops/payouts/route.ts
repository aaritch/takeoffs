import { NextResponse } from 'next/server';
import type { PayoutsResponse } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { payoutService, payoutToView } from '@/server/modules/service-ops';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * GET /v1/ops/payouts[?estimator=<profileId>] — estimator payouts, platform view (P4-04). Platform
 * staff only; an estimator filter narrows to one profile's earnings.
 */
export async function GET(request: Request) {
  return platformHandler(
    request,
    async () => {
      const estimator = new URL(request.url).searchParams.get('estimator');
      const payouts = estimator
        ? await payoutService.listForEstimator(getDb(), estimator)
        : await payoutService.listAll(getDb());
      const body: PayoutsResponse = { payouts: payouts.map(payoutToView) };
      return NextResponse.json(body);
    },
    { roles: ['PLATFORM_ADMIN', 'SERVICE_QA', 'SERVICE_ESTIMATOR'] },
  );
}
