import type { PresenceCursor } from '@takeoff/contracts';

/**
 * Live presence (spec §13, P5-04) — pure, in-memory state the realtime gateway maintains PER TAKEOFF
 * and fans out as deltas. Tracks who's viewing a takeoff, their cursor, and which measurements they
 * have selected (the live "who's editing what" cue). This is intentionally EPHEMERAL and
 * NON-AUTHORITATIVE: it's rebuilt from live connections and never persisted; the DB is the source of
 * truth on reconnect (the caveat). Kept pure so presence logic is testable without a socket.
 */
export interface Participant {
  userId: string;
  displayName: string | null;
  cursor: PresenceCursor | null;
  selection: string[];
  lastSeenAtMs: number;
}

export type PresenceState = ReadonlyMap<string, Participant>;

export function emptyPresence(): PresenceState {
  return new Map();
}

/** A user joins (or re-announces) — upserts their participant, refreshing last-seen. */
export function join(
  state: PresenceState,
  userId: string,
  opts: { displayName?: string | null; nowMs: number },
): PresenceState {
  const next = new Map(state);
  const existing = next.get(userId);
  next.set(userId, {
    userId,
    displayName: opts.displayName ?? existing?.displayName ?? null,
    cursor: existing?.cursor ?? null,
    selection: existing?.selection ?? [],
    lastSeenAtMs: opts.nowMs,
  });
  return next;
}

/** A heartbeat carrying the user's current cursor/selection — refreshes last-seen. A no-op if absent. */
export function update(
  state: PresenceState,
  userId: string,
  patch: { cursor?: PresenceCursor | null; selection?: string[] },
  nowMs: number,
): PresenceState {
  const existing = state.get(userId);
  if (!existing) return state;
  const next = new Map(state);
  next.set(userId, {
    ...existing,
    ...(patch.cursor !== undefined ? { cursor: patch.cursor } : {}),
    ...(patch.selection !== undefined ? { selection: patch.selection } : {}),
    lastSeenAtMs: nowMs,
  });
  return next;
}

export function leave(state: PresenceState, userId: string): PresenceState {
  if (!state.has(userId)) return state;
  const next = new Map(state);
  next.delete(userId);
  return next;
}

/** The participants seen within `ttlMs` — stale connections (missed heartbeats) drop off. */
export function activeParticipants(
  state: PresenceState,
  nowMs: number,
  ttlMs: number,
): Participant[] {
  return [...state.values()]
    .filter((p) => nowMs - p.lastSeenAtMs <= ttlMs)
    .sort((a, b) => a.userId.localeCompare(b.userId));
}
