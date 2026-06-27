import { NextResponse } from 'next/server';
import { ReassignOrderRequest } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { orderToView } from '@/server/modules/orders';
import { assignmentService } from '@/server/modules/service-ops';
import { parseBody, platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/orders/{id}/reassign — platform-admin manual override: assign the order to a specific
 * estimator, syncing capacity on both. Cross-org (admin connection); restricted to PLATFORM_ADMIN.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return platformHandler(
    request,
    async (actor) => {
      const body = await parseBody(request, ReassignOrderRequest);
      const order = await assignmentService.reassign(getDb(), id, body.estimatorId, {
        userId: actor.userId,
        role: actor.serviceRole,
      });
      return NextResponse.json({
        assigned: true,
        estimatorId: body.estimatorId,
        order: orderToView(order),
      });
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}
