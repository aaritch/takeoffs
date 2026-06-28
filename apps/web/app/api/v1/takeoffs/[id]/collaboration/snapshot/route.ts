import { NextResponse } from 'next/server';
import type { CollaborationSnapshotResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { collaborationService, commentToView } from '@/server/modules/collaboration';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * GET /v1/takeoffs/{id}/collaboration/snapshot — the authoritative durable collaboration state a
 * client (re)loads on connect (P5-04). The caveat: real-time presence/edit deltas are
 * non-authoritative, so on reconnect the client discards buffered deltas and trusts this snapshot +
 * the takeoff's measurements/rollups (the DB is the source of truth).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const { comments } = await withOrgScope(getAppDb(), orgId, (tx) =>
      collaborationService.snapshot(tx, id),
    );
    const body: CollaborationSnapshotResponse = { comments: comments.map(commentToView) };
    return NextResponse.json(body);
  });
}
