import { z } from 'zod';

/**
 * Advanced collaboration (spec §13, P5-04). Two durable concerns live here (the DB source of truth):
 * comments anchored to measurements, and the reconnect snapshot a client re-pulls. Live presence +
 * editing cues are EPHEMERAL deltas fanned out by the realtime gateway — non-authoritative; the DB is
 * the truth on reconnect (the caveat), which is why presence is not persisted.
 */

/** A comment, optionally ANCHORED to a measurement (by its stable id, so it survives geometry edits). */
export const CommentView = z.object({
  id: z.string().uuid(),
  takeoffId: z.string().uuid(),
  measurementId: z.string().uuid().nullable(),
  sheetId: z.string().uuid().nullable(),
  parentCommentId: z.string().uuid().nullable(),
  authorUserId: z.string().uuid(),
  body: z.string(),
  resolved: z.boolean(),
  resolvedByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CommentView = z.infer<typeof CommentView>;

/** POST /v1/takeoffs/{id}/comments — add a comment, optionally anchored to a measurement/sheet/thread. */
export const CreateCommentRequest = z.object({
  body: z.string().min(1),
  measurementId: z.string().uuid().optional(),
  sheetId: z.string().uuid().optional(),
  parentCommentId: z.string().uuid().optional(),
});
export type CreateCommentRequest = z.infer<typeof CreateCommentRequest>;

export const CommentResponse = z.object({ comment: CommentView });
export type CommentResponse = z.infer<typeof CommentResponse>;

export const CommentsResponse = z.object({ comments: z.array(CommentView) });
export type CommentsResponse = z.infer<typeof CommentsResponse>;

/** GET /v1/takeoffs/{id}/collaboration/snapshot — the authoritative durable state to load on (re)connect. */
export const CollaborationSnapshotResponse = z.object({ comments: z.array(CommentView) });
export type CollaborationSnapshotResponse = z.infer<typeof CollaborationSnapshotResponse>;

/** A live cursor position in normalized sheet coordinates (ephemeral; not persisted). */
export const PresenceCursor = z.object({
  sheetId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
});
export type PresenceCursor = z.infer<typeof PresenceCursor>;

/**
 * One participant's live presence in a takeoff (the realtime-gateway protocol shape). `selection` is
 * the measurements they currently have selected — the live "who's editing what" cue.
 */
export const PresenceParticipant = z.object({
  userId: z.string().uuid(),
  displayName: z.string().nullable(),
  cursor: PresenceCursor.nullable(),
  selection: z.array(z.string().uuid()),
  lastSeenAt: z.string().datetime(),
});
export type PresenceParticipant = z.infer<typeof PresenceParticipant>;
