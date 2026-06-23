import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { NotFound } from '@/server/modules/orders/errors';
import { orderToView, ordersService } from '@/server/modules/orders';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/orders/{id} — fetch one order. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const order = await withOrgScope(getAppDb(), orgId, (tx) => ordersService.getById(tx, id));
    if (!order) throw NotFound();
    return NextResponse.json({ order: orderToView(order) });
  });
}
