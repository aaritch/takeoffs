import type { CommentView } from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { takeoffsRepo } from '../takeoffs/repository';
import { measurementsRepo } from '../measurements';
import { NotFound, ValidationFailed } from '../source-files/errors';
import { commentsRepo, type Comment } from './repository';

export function commentToView(c: Comment): CommentView {
  return {
    id: c.id,
    takeoffId: c.takeoff_id,
    measurementId: c.measurement_id,
    sheetId: c.sheet_id,
    parentCommentId: c.parent_comment_id,
    authorUserId: c.author_user_id,
    body: c.body,
    resolved: c.resolved,
    resolvedByUserId: c.resolved_by_user_id,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

export interface CreateCommentInput {
  takeoffId: string;
  authorUserId: string;
  body: string;
  measurementId?: string;
  sheetId?: string;
  parentCommentId?: string;
}

/**
 * Comments + the reconnect snapshot (P5-04). Comments are the DURABLE, authoritative collaboration
 * state (live presence/edit deltas are ephemeral and handled by the realtime gateway). A comment
 * anchors to a measurement by its stable id, so it survives geometry edits.
 */
export const collaborationService = {
  async createComment(tx: OrgScopedTx, input: CreateCommentInput): Promise<Comment> {
    const orgId = await currentOrgId(tx);
    const takeoff = await takeoffsRepo.getById(tx, input.takeoffId);
    if (!takeoff) throw NotFound('Takeoff not found');

    // If anchored, the measurement must exist (RLS-scoped) — the anchor must be real.
    if (input.measurementId) {
      const measurement = await measurementsRepo.getById(tx, input.measurementId);
      if (!measurement) {
        throw ValidationFailed('Anchor measurement not found', { field: 'measurementId' });
      }
    }
    if (input.parentCommentId) {
      const parent = await commentsRepo.getById(tx, input.parentCommentId);
      if (!parent) throw ValidationFailed('Parent comment not found', { field: 'parentCommentId' });
    }

    return commentsRepo.insert(tx, {
      org_id: orgId,
      takeoff_id: input.takeoffId,
      author_user_id: input.authorUserId,
      body: input.body,
      measurement_id: input.measurementId ?? null,
      sheet_id: input.sheetId ?? null,
      parent_comment_id: input.parentCommentId ?? null,
    });
  },

  listForTakeoff(tx: OrgScopedTx, takeoffId: string): Promise<Comment[]> {
    return commentsRepo.listByTakeoff(tx, takeoffId);
  },

  listForMeasurement(tx: OrgScopedTx, measurementId: string): Promise<Comment[]> {
    return commentsRepo.listByMeasurement(tx, measurementId);
  },

  async resolveComment(tx: OrgScopedTx, id: string, userId: string): Promise<Comment> {
    const updated = await commentsRepo.update(tx, id, {
      resolved: true,
      resolved_by_user_id: userId,
    });
    if (!updated) throw NotFound('Comment not found');
    return updated;
  },

  async reopenComment(tx: OrgScopedTx, id: string): Promise<Comment> {
    const updated = await commentsRepo.update(tx, id, {
      resolved: false,
      resolved_by_user_id: null,
    });
    if (!updated) throw NotFound('Comment not found');
    return updated;
  },

  async deleteComment(tx: OrgScopedTx, id: string): Promise<void> {
    const existing = await commentsRepo.getById(tx, id);
    if (!existing) throw NotFound('Comment not found');
    await commentsRepo.softDelete(tx, id);
  },

  /**
   * The authoritative durable state a client (re)loads on connect — the caveat: real-time deltas are
   * non-authoritative, so on reconnect the client discards buffered deltas and trusts this.
   */
  async snapshot(tx: OrgScopedTx, takeoffId: string): Promise<{ comments: Comment[] }> {
    const takeoff = await takeoffsRepo.getById(tx, takeoffId);
    if (!takeoff) throw NotFound('Takeoff not found');
    return { comments: await commentsRepo.listByTakeoff(tx, takeoffId) };
  },
};
