import type {
  OrderEventView,
  OrderPriority,
  OrderStatus,
  OrderView,
  ServiceTier,
} from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { sheetsRepo } from '../ingestion';
import { meteringService } from '../billing';
import { stubAuthorizer, retainerService, type PaymentAuthorizer } from '../payments';
import { computeQuote, pricingRulesRepo } from '../pricing';
import { NotFound, PaymentRequired, ValidationFailed } from './errors';
import { ordersRepo, type Order, type OrderEvent } from './repository';
import { assertTransition } from './state-machine';

export interface Actor {
  userId: string;
  role: string;
}

/**
 * PROVISIONAL managed-service dispute / auto-accept window (P3-07). After delivery the customer has
 * this long to accept or dispute; absent action the order auto-accepts. The owner sets the real
 * number (STATE §7 TBD) — this is the mechanism's default.
 */
export const DISPUTE_WINDOW_HOURS = 72;

function disputeDeadline(o: Order): string | null {
  if (!o.delivered_at) return null;
  return new Date(o.delivered_at.getTime() + DISPUTE_WINDOW_HOURS * 3_600_000).toISOString();
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
    disputeDeadline: disputeDeadline(o),
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
    opts: { note?: string; set?: Partial<Order>; payload?: Record<string, unknown> } = {},
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
      payload: { ...(opts.payload ?? {}), ...(opts.note ? { note: opts.note } : {}) },
    });
    return updated;
  },

  /**
   * Quote a DRAFT order from the pricing rules (P3-02): compute price + turnaround from its tier,
   * priority, requested-trade count, and the plan set's sheet count, then move DRAFT → QUOTED with
   * those fields stamped. The state machine enforces that only a DRAFT order can be quoted.
   */
  async quote(tx: OrgScopedTx, orderId: string, actor: Actor): Promise<Order> {
    const order = await ordersRepo.getById(tx, orderId);
    if (!order) throw NotFound();
    const rule = await pricingRulesRepo.get(tx, order.service_tier, order.priority);
    if (!rule) {
      throw ValidationFailed(
        `No pricing rule for ${order.service_tier}/${order.priority}`,
        'serviceTier',
      );
    }
    const sheetCount = order.plan_set_id
      ? (await sheetsRepo.listByPlanSet(tx, order.plan_set_id)).length
      : 0;
    const quote = computeQuote(rule, { tradeCount: order.requested_trades.length, sheetCount });
    return ordersService.transition(tx, orderId, 'QUOTED', actor, {
      set: {
        price_quote_minor: quote.priceQuoteMinor,
        promised_turnaround_hours: quote.promisedTurnaroundHours,
      },
      note: `Quoted ${quote.priceQuoteMinor} (minor) · ${quote.promisedTurnaroundHours}h`,
    });
  },

  /**
   * Place a QUOTED order (P3-03): SECURE payment first (charge authorization, or a retainer draw for
   * RETAINER_DRAW orders), then move QUOTED → PLACED. Payment + the status change happen in one
   * transaction, so a declined charge or insufficient retainer rolls everything back — the order
   * stays QUOTED and never enters the queue (the caveat: no unpaid work). `placed_at` is stamped by
   * the transition, starting the SLA clock.
   */
  async place(
    tx: OrgScopedTx,
    orderId: string,
    actor: Actor,
    deps: { authorizer: PaymentAuthorizer } = { authorizer: stubAuthorizer },
  ): Promise<Order> {
    const order = await ordersRepo.getById(tx, orderId);
    if (!order) throw NotFound();
    if (order.price_quote_minor == null) {
      throw ValidationFailed('Order must be quoted before it can be placed', 'status');
    }
    // A managed order is a billable event (P4-02): meter it exactly-once in this transaction, before
    // charging — so a rolled-back placement leaves no usage.
    await meteringService.meter(tx, {
      orgId: order.org_id,
      metric: 'MANAGED_ORDER',
      referenceId: order.id,
    });
    const amount = order.price_quote_minor;

    let payload: Record<string, unknown>;
    if (order.service_tier === 'RETAINER_DRAW') {
      // Draw against the prepaid balance; the debit + its ledger entry commit with the placement.
      const newBalance = await retainerService.draw(tx, order.org_id, amount, {
        orderId: order.id,
      });
      if (newBalance === null) throw PaymentRequired('Insufficient retainer balance');
      payload = { paymentMethod: 'RETAINER', retainerBalanceMinor: newBalance };
    } else {
      const auth = await deps.authorizer.authorizeCharge({
        orgId: order.org_id,
        orderId,
        amountMinor: amount,
      });
      if (!auth.ok) throw PaymentRequired(auth.reason ?? 'Payment authorization failed');
      payload = { paymentMethod: 'CHARGE', paymentReference: auth.reference ?? null };
    }

    return ordersService.transition(tx, orderId, 'PLACED', actor, {
      note: 'Payment secured',
      payload,
    });
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
