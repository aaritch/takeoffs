import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { orderToView, ordersService } from '@/server/modules/orders';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/orders/{id}/quote — price a DRAFT order from the pricing rules and move it to QUOTED
 * (P3-02). Price + turnaround are computed server-side from the rules table; the client sends nothing.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const order = await withOrgScope(getAppDb(), orgId, (tx) =>
      ordersService.quote(tx, id, { userId, role }),
    );
    return NextResponse.json({ order: orderToView(order) });
  });
}
