import type { OrderQueueItemView, OrderSlaStatus, EstimatorLoadView } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { ordersRepo, type Order } from '../orders/repository';
import { serviceProfilesRepo } from './repository';

/**
 * Internal ops dashboard (P3-08) — the service team's live view: the order queue with SLA timers
 * and per-estimator capacity. Platform-side, cross-org (runs on the admin connection). The reads are
 * a snapshot at request time; "live" is the client polling this (the realtime push plane is separate
 * and off-Vercel).
 *
 * SLA timers run from `placed_at` against `promised_turnaround_hours`. The clock is the WORK window
 * (placed → delivered): once delivered it stops (MET/LATE), and post-delivery customer holds
 * (awaiting acceptance, dispute) never accrue against the estimator. AT_RISK fires in the final
 * `SLA_RISK_FRACTION` of the window. NOTE: the threshold + the exact pause policy are the business's
 * to set (STATE §7 TBD); these are the mechanism's defaults.
 */

/** Fraction of the promised window remaining at/under which an in-flight order is AT_RISK. */
export const SLA_RISK_FRACTION = 0.25;

export interface OrderSla {
  status: OrderSlaStatus;
  deadline: Date | null;
}

/** Pure SLA evaluation for one order at time `now`. */
export function computeSla(order: Order, now: Date): OrderSla {
  if (!order.placed_at || order.promised_turnaround_hours == null) {
    return { status: 'NONE', deadline: null };
  }
  const windowMs = order.promised_turnaround_hours * 3_600_000;
  const deadline = new Date(order.placed_at.getTime() + windowMs);

  // Delivered: the work window is closed — was it on time?
  if (order.delivered_at) {
    return { status: order.delivered_at <= deadline ? 'MET' : 'LATE', deadline };
  }
  // In flight.
  if (now > deadline) return { status: 'BREACHED', deadline };
  const riskAt = new Date(deadline.getTime() - SLA_RISK_FRACTION * windowMs);
  if (now >= riskAt) return { status: 'AT_RISK', deadline };
  return { status: 'ON_TRACK', deadline };
}

function toQueueItem(order: Order, now: Date): OrderQueueItemView {
  const sla = computeSla(order, now);
  return {
    id: order.id,
    orgId: order.org_id,
    status: order.status,
    serviceTier: order.service_tier,
    priority: order.priority,
    placedAt: order.placed_at?.toISOString() ?? null,
    slaDeadline: sla.deadline?.toISOString() ?? null,
    slaStatus: sla.status,
    escalated: sla.status === 'AT_RISK' || sla.status === 'BREACHED',
    assignedEstimatorId: order.assigned_estimator_id,
  };
}

export const opsDashboardService = {
  /** The non-terminal order queue across all orgs, each with its SLA status (escalated ⇒ flagged). */
  async queue(db: DB, now: Date): Promise<OrderQueueItemView[]> {
    return db.transaction(async (tx) => {
      const orders = await ordersRepo.listQueue(tx);
      return orders.map((o) => toQueueItem(o, now));
    });
  },

  /** Per-estimator capacity load (active estimators), for the dashboard's capacity view. */
  async estimatorLoad(db: DB): Promise<EstimatorLoadView[]> {
    return db.transaction(async (tx) => {
      const estimators = await serviceProfilesRepo.listActiveEstimators(tx);
      return estimators.map((e) => ({
        profileId: e.id,
        currentLoad: e.current_capacity,
        maxConcurrent: e.max_concurrent_orders,
        available: e.current_capacity < e.max_concurrent_orders,
      }));
    });
  },
};
