import { z } from 'zod';
import { OrderPriority, OrderStatus, ServiceTier } from '../enums';

/**
 * SLA state of an order against its promised turnaround (P3-08). NONE = no SLA yet (unquoted/
 * unplaced); for delivered orders MET/LATE record whether it shipped on time; for in-flight work
 * ON_TRACK → AT_RISK (approaching the deadline) → BREACHED.
 */
export const OrderSlaStatus = z.enum(['NONE', 'ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'LATE']);
export type OrderSlaStatus = z.infer<typeof OrderSlaStatus>;

/** A row in the internal ops order queue. */
export const OrderQueueItemView = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  status: OrderStatus,
  serviceTier: ServiceTier,
  priority: OrderPriority,
  placedAt: z.string().datetime().nullable(),
  slaDeadline: z.string().datetime().nullable(),
  slaStatus: OrderSlaStatus,
  /** AT_RISK or BREACHED — the order is escalated to platform admins and visibly flagged. */
  escalated: z.boolean(),
  assignedEstimatorId: z.string().uuid().nullable(),
});
export type OrderQueueItemView = z.infer<typeof OrderQueueItemView>;

export const OrderQueueResponse = z.object({ orders: z.array(OrderQueueItemView) });
export type OrderQueueResponse = z.infer<typeof OrderQueueResponse>;

/** An estimator's current capacity load for the ops dashboard. */
export const EstimatorLoadView = z.object({
  profileId: z.string().uuid(),
  currentLoad: z.number().int().nonnegative(),
  maxConcurrent: z.number().int().nonnegative(),
  available: z.boolean(),
});
export type EstimatorLoadView = z.infer<typeof EstimatorLoadView>;

export const EstimatorLoadResponse = z.object({ estimators: z.array(EstimatorLoadView) });
export type EstimatorLoadResponse = z.infer<typeof EstimatorLoadResponse>;
