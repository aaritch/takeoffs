import { NextResponse } from 'next/server';
import type { SubscriptionResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { subscriptionToView, subscriptionsRepo } from '@/server/modules/billing';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/billing/subscription — the caller's org subscription + entitlements (null if none) (P4-01). */
export async function GET(request: Request) {
  return apiHandler(request, async ({ orgId }) => {
    const sub = await withOrgScope(getAppDb(), orgId, (tx) =>
      subscriptionsRepo.getByOrg(tx, orgId),
    );
    const body: SubscriptionResponse = { subscription: sub ? subscriptionToView(sub) : null };
    return NextResponse.json(body);
  });
}
