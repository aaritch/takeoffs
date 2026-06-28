import { NextResponse } from 'next/server';
import { ReversePayoutRequest } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { payoutService, payoutToView } from '@/server/modules/service-ops';
import { parseBody, platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/ops/payouts/{id}/reverse — reverse a settled payout (P4-04). PLATFORM_ADMIN only; only a
 * PAID payout can be reversed, and the prior amount + transfer ref are preserved for audit.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return platformHandler(
    request,
    async () => {
      const { reason } = await parseBody(request, ReversePayoutRequest);
      const payout = await payoutService.reverse(getDb(), id, reason);
      return NextResponse.json({ payout: payoutToView(payout) });
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}
