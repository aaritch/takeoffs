// Orders module (P3-01) — the managed-service Order model + the server-enforced lifecycle state
// machine, with an append-only OrderEvent audit log. Illegal transitions are rejected; the client
// never drives status. Pricing/assignment/fulfillment/QA build on this in later Phase-3 tasks.
export { ordersService, orderToView, orderEventToView, DISPUTE_WINDOW_HOURS } from './service';
export type { Actor, CreateOrderInput } from './service';
export { ordersRepo } from './repository';
export type { Order, OrderEvent } from './repository';
export { canTransition, legalTransitions, isTerminal, assertTransition } from './state-machine';
export { isContiguousAuditTrail, isCompleteAuditEvent } from './audit';
export { OrderError } from './errors';
export type { OrderErrorCode } from './errors';
