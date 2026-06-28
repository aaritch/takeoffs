import { NextResponse } from 'next/server';
import {
  CreateCommentRequest,
  type CommentResponse,
  type CommentsResponse,
} from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { collaborationService, commentToView } from '@/server/modules/collaboration';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/takeoffs/{id}/comments[?measurementId=] — the takeoff's comments (P5-04). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const measurementId = new URL(request.url).searchParams.get('measurementId');
    const comments = await withOrgScope(getAppDb(), orgId, (tx) =>
      measurementId
        ? collaborationService.listForMeasurement(tx, measurementId)
        : collaborationService.listForTakeoff(tx, id),
    );
    const body: CommentsResponse = { comments: comments.map(commentToView) };
    return NextResponse.json(body);
  });
}

/** POST /v1/takeoffs/{id}/comments — add a comment, optionally anchored to a measurement/thread. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId, userId }) => {
    const input = await parseBody(request, CreateCommentRequest);
    const comment = await withOrgScope(getAppDb(), orgId, (tx) =>
      collaborationService.createComment(tx, {
        takeoffId: id,
        authorUserId: userId,
        body: input.body,
        ...(input.measurementId !== undefined ? { measurementId: input.measurementId } : {}),
        ...(input.sheetId !== undefined ? { sheetId: input.sheetId } : {}),
        ...(input.parentCommentId !== undefined ? { parentCommentId: input.parentCommentId } : {}),
      }),
    );
    const body: CommentResponse = { comment: commentToView(comment) };
    return NextResponse.json(body, { status: 201 });
  });
}
