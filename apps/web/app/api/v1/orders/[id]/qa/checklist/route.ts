import { NextResponse } from 'next/server';
import { getDb } from '@/server/data/client';
import { qaService } from '@/server/modules/service-ops';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/orders/{id}/qa/checklist — the auto-computed QA checklist for a reviewer (P3-06). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return platformHandler(
    request,
    async () => {
      const checklist = await qaService.checklist(getDb(), id);
      return NextResponse.json({ checklist });
    },
    { roles: ['SERVICE_QA', 'PLATFORM_ADMIN'] },
  );
}
