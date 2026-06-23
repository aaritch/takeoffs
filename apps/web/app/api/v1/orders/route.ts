import { NextResponse } from 'next/server';
import { CreateOrderRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { orderToView, ordersService } from '@/server/modules/orders';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/orders — place a managed-service order; it starts in DRAFT (P3-01). */
export async function POST(request: Request, ctx: object) {
  void ctx;
  return apiHandler(request, async ({ orgId, userId, role }) => {
    const body = await parseBody(request, CreateOrderRequest);
    const order = await withOrgScope(getAppDb(), orgId, (tx) =>
      ordersService.create(
        tx,
        {
          projectId: body.projectId,
          ...(body.planSetId ? { planSetId: body.planSetId } : {}),
          serviceTier: body.serviceTier,
          requestedTrades: body.requestedTrades,
          ...(body.scopeNotes ? { scopeNotes: body.scopeNotes } : {}),
          ...(body.priority ? { priority: body.priority } : {}),
        },
        { userId, role },
      ),
    );
    return NextResponse.json({ order: orderToView(order) }, { status: 201 });
  });
}

/** GET /v1/orders — list the org's orders (newest first). */
export async function GET(request: Request, ctx: object) {
  void ctx;
  return apiHandler(request, async ({ orgId }) => {
    const list = await withOrgScope(getAppDb(), orgId, (tx) => ordersService.listByOrg(tx));
    return NextResponse.json({ orders: list.map(orderToView) });
  });
}
