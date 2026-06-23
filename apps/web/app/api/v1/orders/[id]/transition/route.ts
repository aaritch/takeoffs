import { NextResponse } from 'next/server';
import { TransitionOrderRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { orderToView, ordersService } from '@/server/modules/orders';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/orders/{id}/transition — move an order to another status. The lifecycle is enforced
 * server-side (P3-01); an illegal transition is rejected (409) and every legal one writes an
 * immutable OrderEvent.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const body = await parseBody(request, TransitionOrderRequest);
    const order = await withOrgScope(getAppDb(), orgId, (tx) =>
      ordersService.transition(
        tx,
        id,
        body.toStatus,
        { userId, role },
        {
          ...(body.note ? { note: body.note } : {}),
        },
      ),
    );
    return NextResponse.json({ order: orderToView(order) });
  });
}
