// Collaboration module (P5-04) — durable comments anchored to measurements + the reconnect snapshot
// (the DB source of truth), plus the pure presence model the realtime gateway fans out as ephemeral,
// non-authoritative deltas (the WS gateway itself is the off-Vercel realtime plane).
export { collaborationService, commentToView, type CreateCommentInput } from './service';
export { commentsRepo, type Comment } from './repository';
export {
  emptyPresence,
  join,
  update,
  leave,
  activeParticipants,
  type Participant,
  type PresenceState,
} from './presence';
