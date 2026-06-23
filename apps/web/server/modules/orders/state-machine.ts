import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '@takeoff/contracts';
import { IllegalTransition } from './errors';

/**
 * The order lifecycle state machine (P3-01). The legal transitions are canonical in
 * `@takeoff/contracts` (`ORDER_STATUS_TRANSITIONS`); this is the server-side enforcement built on
 * it. Transition rules live ONLY on the server — the client never drives status — so an illegal
 * move is always rejected here, never trusted from a request.
 */

/** The statuses an order may move to from `from` (empty ⇒ terminal). */
export function legalTransitions(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

/** Whether a status is terminal (no outgoing transitions): ACCEPTED or CANCELLED. */
export function isTerminal(status: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[status].length === 0;
}

/** Throw {@link IllegalTransition} unless `from → to` is a legal lifecycle move. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw IllegalTransition(from, to);
}
