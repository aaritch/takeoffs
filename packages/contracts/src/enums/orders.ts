import { z } from 'zod';

/** Managed-service tier (spec §5.5, Order.service_tier). */
export const ServiceTier = z.enum(['SINGLE_TRADE', 'FULL_PROJECT', 'RETAINER_DRAW']);
export type ServiceTier = z.infer<typeof ServiceTier>;

/** Order priority (spec §5.5 / §11.6). RUSH carries shorter SLAs and higher price multipliers. */
export const OrderPriority = z.enum(['STANDARD', 'RUSH']);
export type OrderPriority = z.infer<typeof OrderPriority>;

/**
 * Managed-service order lifecycle (spec §11.2). Allowed transitions are enforced
 * server-side in P3-01; illegal transitions are rejected. Every transition writes an
 * OrderEvent.
 *
 * Happy path:
 *   DRAFT → QUOTED → PLACED → ASSIGNED → IN_PROGRESS → IN_QA → DELIVERED → ACCEPTED
 * Loops / side states:
 *   IN_QA → REVISIONS → IN_PROGRESS   (QA returns work to the estimator)
 *   DELIVERED → DISPUTED              (customer opens a dispute within the window)
 *   (most pre-delivery states) → CANCELLED
 *
 * ACCEPTED and CANCELLED are terminal. Payouts settle only on ACCEPTED or auto-accept after
 * the dispute window (spec §11.5 / gate P4-04); the exact dispute/auto-accept window is a
 * TBD decision (STATE §7).
 */
export const OrderStatus = z.enum([
  'DRAFT',
  'QUOTED',
  'PLACED',
  'ASSIGNED',
  'IN_PROGRESS',
  'IN_QA',
  'REVISIONS',
  'DELIVERED',
  'ACCEPTED',
  'CANCELLED',
  'DISPUTED',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

/**
 * Provisional legal transition table for {@link OrderStatus}. This is documentation-as-data
 * for the state machine; the enforcing guard lives in the orders module (P3-01), not here.
 * An empty array marks a terminal state. Dispute-resolution edges may be refined once the
 * dispute-window decision is settled.
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ['QUOTED', 'CANCELLED'],
  QUOTED: ['PLACED', 'CANCELLED'],
  PLACED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['IN_QA', 'CANCELLED'],
  IN_QA: ['REVISIONS', 'DELIVERED'],
  REVISIONS: ['IN_PROGRESS'],
  DELIVERED: ['ACCEPTED', 'DISPUTED'],
  DISPUTED: ['REVISIONS', 'ACCEPTED', 'CANCELLED'],
  ACCEPTED: [],
  CANCELLED: [],
};
