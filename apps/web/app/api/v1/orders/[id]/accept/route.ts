import { NextResponse } from 'next/server';
import { getDb } from '@/server/data/client';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { orderToView } from '@/server/modules/orders';
import { deliveryService, payoutService } from '@/server/modules/service-ops';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/orders/{id}/accept — the customer accepts a delivered order → ACCEPTED (P3-07), which
 * settles the estimator payout (P4-04). Both run server-side; the transfer is never initiated from
 * the client. Payout processing runs on the platform connection AFTER accept commits (it's cross-org
 * and makes an external provider call).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const order = await withOrgScope(getAppDb(), orgId, (tx) =>
      deliveryService.accept(tx, id, { userId, role }),
    );
    await payoutService.processAcceptedOrder(getDb(), id);
    return NextResponse.json({ order: orderToView(order) });
  });
}
