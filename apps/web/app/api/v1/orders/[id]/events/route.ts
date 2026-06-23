import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { orderEventToView, ordersService } from '@/server/modules/orders';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/orders/{id}/events — the order's immutable audit trail, oldest first (P3-01). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const events = await withOrgScope(getAppDb(), orgId, (tx) => ordersService.listEvents(tx, id));
    return NextResponse.json({ events: events.map(orderEventToView) });
  });
}
