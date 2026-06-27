import { NextResponse } from 'next/server';
import { getDb } from '@/server/data/client';
import { orderToView } from '@/server/modules/orders';
import { qaService } from '@/server/modules/service-ops';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/orders/{id}/submit-qa — the assigned estimator submits completed work (IN_PROGRESS → IN_QA). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return platformHandler(
    request,
    async (actor) => {
      const order = await qaService.submitForQa(getDb(), id, actor.serviceProfileId, {
        userId: actor.userId,
        role: actor.serviceRole,
      });
      return NextResponse.json({ order: orderToView(order) });
    },
    { roles: ['SERVICE_ESTIMATOR'] },
  );
}
