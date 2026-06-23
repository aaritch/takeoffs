import type {
  OrderEventView,
  OrderPriority,
  OrderStatus,
  OrderView,
  ServiceTier,
} from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { NotFound } from './errors';
import { ordersRepo, type Order, type OrderEvent } from './repository';
import { assertTransition } from './state-machine';

export interface Actor {
  userId: string;
  role: string;
}

export interface CreateOrderInput {
  projectId: string;
  planSetId?: string;
  serviceTier: ServiceTier;
  requestedTrades: string[];
  scopeNotes?: string;
  priority?: OrderPriority;
}

export function orderToView(o: Order): OrderView {
  return {
    id: o.id,
    orgId: o.org_id,
    projectId: o.project_id,
    planSetId: o.plan_set_id,
    serviceTier: o.service_tier,
    requestedTrades: o.requested_trades,
    scopeNotes: o.scope_notes,
    priority: o.priority,
    status: o.status,
    priceQuoteMinor: o.price_quote_minor,
    promisedTurnaroundHours: o.promised_turnaround_hours,
    assignedEstimatorId: o.assigned_estimator_id,
    qaReviewerId: o.qa_reviewer_id,
    deliveredTakeoffId: o.delivered_takeoff_id,
    deliveredAt: o.delivered_at?.toISOString() ?? null,
    placedAt: o.placed_at?.toISOString() ?? null,
    createdAt: o.created_at.toISOString(),
  };
}

export function orderEventToView(e: OrderEvent): OrderEventView {
  return {
    id: e.id,
    orderId: e.order_id,
    eventType: e.event_type,
    fromStatus: e.from_status,
    toStatus: e.to_status,
    actorId: e.actor_id,
    actorRole: e.actor_role,
    payload: e.payload,
    occurredAt: e.occurred_at.toISOString(),
  };
}

export const ordersService = {
  /** Create an order in DRAFT and record its creation as the first audit event. */
  async create(tx: OrgScopedTx, input: CreateOrderInput, actor: Actor): Promise<Order> {
    const orgId = await currentOrgId(tx);
    const order = await ordersRepo.insert(tx, {
      org_id: orgId,
      project_id: input.projectId,
      plan_set_id: input.planSetId ?? null,
      requested_by_user_id: actor.userId,
      service_tier: input.serviceTier,
      requested_trades: input.requestedTrades,
      scope_notes: input.scopeNotes ?? null,
      priority: input.priority ?? 'STANDARD',
      status: 'DRAFT',
    });
    await ordersRepo.appendEvent(tx, {
      org_id: orgId,
      order_id: order.id,
      event_type: 'CREATED',
      from_status: null,
      to_status: 'DRAFT',
      actor_id: actor.userId,
      actor_role: actor.role,
      payload: { serviceTier: input.serviceTier, priority: order.priority },
    });
    return order;
  },

  /**
   * Move an order to `toStatus`, enforcing the lifecycle and appending an immutable audit event.
   * `set` lets a caller stamp the columns a transition owns (e.g. assigned_estimator_id); PLACED
   * and DELIVERED auto-stamp their timestamps. The whole thing is one transaction, so the status
   * change and its audit row commit together.
   */
  async transition(
    tx: OrgScopedTx,
    orderId: string,
    toStatus: OrderStatus,
    actor: Actor,
    opts: { note?: string; set?: Partial<Order> } = {},
  ): Promise<Order> {
    const order = await ordersRepo.getById(tx, orderId);
    if (!order) throw NotFound();
    assertTransition(order.status, toStatus);

    const patch: Partial<Order> = { ...(opts.set ?? {}), status: toStatus };
    if (toStatus === 'PLACED' && !order.placed_at) patch.placed_at = new Date();
    if (toStatus === 'DELIVERED' && !order.delivered_at) patch.delivered_at = new Date();

    const updated = (await ordersRepo.update(tx, orderId, patch))!;
    await ordersRepo.appendEvent(tx, {
      org_id: order.org_id,
      order_id: order.id,
      event_type: 'TRANSITION',
      from_status: order.status,
      to_status: toStatus,
      actor_id: actor.userId,
      actor_role: actor.role,
      payload: opts.note ? { note: opts.note } : {},
    });
    return updated;
  },

  getById(tx: OrgScopedTx, id: string): Promise<Order | undefined> {
    return ordersRepo.getById(tx, id);
  },

  listByOrg(tx: OrgScopedTx): Promise<Order[]> {
    return ordersRepo.listByOrg(tx);
  },

  listEvents(tx: OrgScopedTx, orderId: string): Promise<OrderEvent[]> {
    return ordersRepo.listEvents(tx, orderId);
  },
};
