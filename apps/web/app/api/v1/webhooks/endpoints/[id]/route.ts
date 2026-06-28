import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { webhookService } from '@/server/modules/webhooks';
import { ApiError, apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** DELETE /v1/webhooks/endpoints/{id} — unsubscribe an endpoint. OWNER/ADMIN only (P5-03). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, role }) => {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an owner or admin can manage webhooks.');
    }
    await withOrgScope(getAppDb(), orgId, (tx) => webhookService.deleteEndpoint(tx, id));
    return NextResponse.json({ ok: true });
  });
}
