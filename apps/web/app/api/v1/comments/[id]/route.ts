import { NextResponse } from 'next/server';
import type { CommentResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { collaborationService, commentToView } from '@/server/modules/collaboration';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** PATCH /v1/comments/{id} — resolve or reopen a comment (P5-04). Body: { resolved: boolean }. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId }) => {
    const { resolved } = (await request.json().catch(() => ({}))) as { resolved?: boolean };
    const comment = await withOrgScope(getAppDb(), orgId, (tx) =>
      resolved
        ? collaborationService.resolveComment(tx, id, userId)
        : collaborationService.reopenComment(tx, id),
    );
    const body: CommentResponse = { comment: commentToView(comment) };
    return NextResponse.json(body);
  });
}

/** DELETE /v1/comments/{id} — remove a comment. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    await withOrgScope(getAppDb(), orgId, (tx) => collaborationService.deleteComment(tx, id));
    return NextResponse.json({ ok: true });
  });
}
