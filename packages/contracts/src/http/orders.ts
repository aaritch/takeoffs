import { z } from 'zod';
import { OrderPriority, OrderStatus, ServiceTier } from '../enums';

/** POST /v1/orders — place a managed-service order (starts in DRAFT). */
export const CreateOrderRequest = z.object({
  projectId: z.string().uuid(),
  planSetId: z.string().uuid().optional(),
  serviceTier: ServiceTier,
  requestedTrades: z.array(z.string().uuid()).default([]),
  scopeNotes: z.string().max(5000).optional(),
  priority: OrderPriority.optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequest>;

/** POST /v1/orders/{id}/transition — move an order to another status (server-enforced). */
export const TransitionOrderRequest = z.object({
  toStatus: OrderStatus,
  note: z.string().max(2000).optional(),
});
export type TransitionOrderRequest = z.infer<typeof TransitionOrderRequest>;

export const OrderView = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  planSetId: z.string().uuid().nullable(),
  serviceTier: ServiceTier,
  requestedTrades: z.array(z.string().uuid()),
  scopeNotes: z.string().nullable(),
  priority: OrderPriority,
  status: OrderStatus,
  priceQuoteMinor: z.number().int().nullable(),
  promisedTurnaroundHours: z.number().int().nullable(),
  assignedEstimatorId: z.string().uuid().nullable(),
  qaReviewerId: z.string().uuid().nullable(),
  deliveredTakeoffId: z.string().uuid().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  placedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type OrderView = z.infer<typeof OrderView>;

/** An immutable audit entry for an order lifecycle transition. */
export const OrderEventView = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  eventType: z.string(),
  fromStatus: OrderStatus.nullable(),
  toStatus: OrderStatus,
  actorId: z.string().uuid().nullable(),
  actorRole: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string().datetime(),
});
export type OrderEventView = z.infer<typeof OrderEventView>;

/** POST /v1/orders/{id}/reassign — platform admin assigns the order to a specific estimator. */
export const ReassignOrderRequest = z.object({ estimatorId: z.string().uuid() });
export type ReassignOrderRequest = z.infer<typeof ReassignOrderRequest>;

/** Result of an assignment attempt: `assigned: false` (with the still-PLACED order) means it waits. */
export const AssignmentResultResponse = z.object({
  assigned: z.boolean(),
  estimatorId: z.string().uuid().nullable(),
  order: OrderView,
});
export type AssignmentResultResponse = z.infer<typeof AssignmentResultResponse>;

export const OrderResponse = z.object({ order: OrderView });
export type OrderResponse = z.infer<typeof OrderResponse>;
export const OrdersListResponse = z.object({ orders: z.array(OrderView) });
export type OrdersListResponse = z.infer<typeof OrdersListResponse>;
export const OrderEventsListResponse = z.object({ events: z.array(OrderEventView) });
export type OrderEventsListResponse = z.infer<typeof OrderEventsListResponse>;
