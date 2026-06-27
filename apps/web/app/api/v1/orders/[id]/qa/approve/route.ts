import { NextResponse } from 'next/server';
import { QaApproveRequest } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { orderToView } from '@/server/modules/orders';
import { qaService } from '@/server/modules/service-ops';
import { parseBody, platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/orders/{id}/qa/approve — QA approves the order → DELIVERED. Blocked unless every checklist
 * item passes (auto-checks + the reviewer's attestations). Restricted to SERVICE_QA (P3-06).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return platformHandler(
    request,
    async (actor) => {
      const body = await parseBody(request, QaApproveRequest);
      const order = await qaService.approve(
        getDb(),
        id,
        actor.serviceProfileId,
        { userId: actor.userId, role: actor.serviceRole },
        body,
      );
      return NextResponse.json({ order: orderToView(order) });
    },
    { roles: ['SERVICE_QA', 'PLATFORM_ADMIN'] },
  );
}
