import type { OrderEvent } from './repository';

/**
 * Order audit-trail integrity (P3-09). The append-only OrderEvent log is the basis for dispute
 * resolution and trust, so it must be COMPLETE — no missing transitions. These pure checks verify an
 * order's events (in chronological order) form a coherent, gap-free chain, and that each carries the
 * provenance a transition must record.
 */

/** Every event records who did what: action type, from/to status (except the opening event), actor. */
export function isCompleteAuditEvent(e: OrderEvent): boolean {
  return (
    e.event_type.length > 0 && e.to_status !== null && e.actor_id !== null && e.actor_role !== null
  );
}

/**
 * Whether the events form a gap-free chain: the first opens at `from_status = null`, and every later
 * event's `from_status` equals the previous event's `to_status`. A gap (a transition that wasn't
 * logged) breaks the chain and returns false.
 */
export function isContiguousAuditTrail(events: OrderEvent[]): boolean {
  if (events.length === 0) return false;
  if (events[0]!.from_status !== null) return false;
  for (let i = 1; i < events.length; i++) {
    if (events[i]!.from_status !== events[i - 1]!.to_status) return false;
  }
  return true;
}
