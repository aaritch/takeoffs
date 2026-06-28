import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { ssoService } from '@/server/modules/sso';
import { ApiError, apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** DELETE /v1/sso/connections/{id} — remove an SSO connection. OWNER/ADMIN only (P5-02). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, role }) => {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an owner or admin can configure SSO.');
    }
    await withOrgScope(getAppDb(), orgId, (tx) => ssoService.deleteConnection(tx, id));
    return NextResponse.json({ ok: true });
  });
}
