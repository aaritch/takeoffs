import { NextResponse } from 'next/server';
import { getDb } from '@/server/data/client';
import { orderEventToView, ordersService } from '@/server/modules/orders';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * GET /v1/ops/orders/{id}/events — any order's immutable audit trail, oldest first, for platform
 * staff (P3-09). Cross-org (admin connection): the trail is the basis for dispute resolution, so ops
 * must be able to read it regardless of which org owns the order.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return platformHandler(
    request,
    async () => {
      const events = await getDb().transaction((tx) => ordersService.listEvents(tx, id));
      return NextResponse.json({ events: events.map(orderEventToView) });
    },
    { roles: ['PLATFORM_ADMIN', 'SERVICE_QA', 'SERVICE_ESTIMATOR'] },
  );
}
