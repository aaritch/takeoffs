import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { orderToView, ordersService } from '@/server/modules/orders';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/orders/{id}/place — confirm a QUOTED order: secure payment (charge or retainer draw),
 * then move QUOTED → PLACED into the queue (P3-03). If payment can't be secured the order stays
 * QUOTED (402) — it never enters the queue. Uses the stub authorizer until Stripe lands (Phase 4).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const order = await withOrgScope(getAppDb(), orgId, (tx) =>
      ordersService.place(tx, id, { userId, role }),
    );
    return NextResponse.json({ order: orderToView(order) });
  });
}
