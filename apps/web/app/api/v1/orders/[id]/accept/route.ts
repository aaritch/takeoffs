import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { orderToView } from '@/server/modules/orders';
import { deliveryService } from '@/server/modules/service-ops';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/orders/{id}/accept — the customer accepts a delivered order → ACCEPTED (P3-07). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const order = await withOrgScope(getAppDb(), orgId, (tx) =>
      deliveryService.accept(tx, id, { userId, role }),
    );
    return NextResponse.json({ order: orderToView(order) });
  });
}
