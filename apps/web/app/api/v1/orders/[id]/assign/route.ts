import { NextResponse } from 'next/server';
import { getDb } from '@/server/data/client';
import { orderToView } from '@/server/modules/orders';
import { assignmentService } from '@/server/modules/service-ops';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/orders/{id}/assign — platform-admin auto-assignment (P3-04/P3-05). Matches a PLACED
 * order to the best eligible estimator; if none is free the order stays PLACED (`assigned: false`)
 * and waits. Cross-org (admin connection); restricted to PLATFORM_ADMIN.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return platformHandler(
    request,
    async (actor) => {
      const result = await assignmentService.autoAssign(getDb(), id, {
        userId: actor.userId,
        role: actor.serviceRole,
      });
      return NextResponse.json({
        assigned: result.assigned,
        estimatorId: result.estimatorId ?? null,
        order: orderToView(result.order),
      });
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}
