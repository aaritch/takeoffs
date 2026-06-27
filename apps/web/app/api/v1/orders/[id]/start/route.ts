import { NextResponse } from 'next/server';
import { getDb } from '@/server/data/client';
import { orderToView } from '@/server/modules/orders';
import { fulfillmentService } from '@/server/modules/service-ops';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/orders/{id}/start — the assigned estimator begins fulfillment (P3-05): creates the
 * managed-service takeoff and moves the order ASSIGNED → IN_PROGRESS. Gated to the assigned
 * estimator (the isolation caveat); the estimator then builds the takeoff in the standard editor.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return platformHandler(
    request,
    async (actor) => {
      const { order, takeoffId } = await fulfillmentService.start(
        getDb(),
        id,
        actor.serviceProfileId,
        { userId: actor.userId, role: actor.serviceRole },
      );
      return NextResponse.json({ order: orderToView(order), takeoffId });
    },
    { roles: ['SERVICE_ESTIMATOR'] },
  );
}
