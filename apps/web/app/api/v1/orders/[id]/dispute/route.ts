import { NextResponse } from 'next/server';
import { DisputeOrderRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { orderToView } from '@/server/modules/orders';
import { deliveryService } from '@/server/modules/service-ops';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/orders/{id}/dispute — the customer disputes a delivered order → DISPUTED (P3-07). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const body = await parseBody(request, DisputeOrderRequest);
    const order = await withOrgScope(getAppDb(), orgId, (tx) =>
      deliveryService.dispute(tx, id, { userId, role }, body.reason),
    );
    return NextResponse.json({ order: orderToView(order) });
  });
}
