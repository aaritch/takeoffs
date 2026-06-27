import type { DB } from '../../data/client';
import type { OrgScopedTx } from '../../data/org-scope';
import { Forbidden, NotFound, ValidationFailed } from '../orders/errors';
import { ordersRepo, type Order } from '../orders/repository';
import { ordersService, type Actor } from '../orders';
import { pickEstimator } from './eligibility';
import { serviceProfilesRepo } from './repository';

/**
 * Estimator assignment & capacity (P3-04). This is a PLATFORM-side, cross-org operation: estimators
 * span customer orgs, so it runs on the admin connection (RLS-bypassing), not an org scope. Auto-
 * assignment is rules-based (trade specialty + capacity); a platform admin can reassign manually.
 * Capacity is the live count of active orders, recomputed (never drifting) as orders move.
 *
 * Caveat (estimator isolation): a SERVICE_ESTIMATOR may touch an order's plan set ONLY if that
 * order is assigned to them — `assertEstimatorCanAccessOrder` is that gate (enforced at the
 * fulfillment access points in P3-05).
 */

export interface AssignmentResult {
  assigned: boolean;
  estimatorId?: string;
  /** The order after the attempt — ASSIGNED on success, still PLACED when no estimator is free. */
  order: Order;
}

async function recomputeCapacity(tx: OrgScopedTx, profileId: string): Promise<void> {
  const load = await ordersRepo.countActiveByEstimator(tx, profileId);
  await serviceProfilesRepo.setCurrentCapacity(tx, profileId, load);
}

/** Set the assignee + move PLACED → ASSIGNED (or just re-point an already-assigned order), then sync capacity. */
async function assignTo(
  tx: OrgScopedTx,
  order: Order,
  profileId: string,
  actor: Actor,
): Promise<void> {
  if (order.status === 'PLACED') {
    await ordersService.transition(tx, order.id, 'ASSIGNED', actor, {
      set: { assigned_estimator_id: profileId },
      payload: { estimatorId: profileId },
    });
  } else {
    await ordersRepo.update(tx, order.id, { assigned_estimator_id: profileId });
    await ordersRepo.appendEvent(tx, {
      org_id: order.org_id,
      order_id: order.id,
      event_type: 'REASSIGNED',
      from_status: order.status,
      to_status: order.status,
      actor_id: actor.userId,
      actor_role: actor.role,
      payload: { estimatorId: profileId },
    });
  }
  await recomputeCapacity(tx, profileId);
}

export const assignmentService = {
  /**
   * Auto-assign a PLACED order to the best eligible, under-capacity estimator. Returns
   * `{ assigned: false }` when none is available — the order stays PLACED and waits visibly.
   */
  async autoAssign(db: DB, orderId: string, actor: Actor): Promise<AssignmentResult> {
    return db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order) throw NotFound();
      if (order.status !== 'PLACED') {
        throw ValidationFailed('Only a PLACED order can be auto-assigned', 'status');
      }
      const estimators = await serviceProfilesRepo.listActiveEstimators(tx);
      const candidates = await Promise.all(
        estimators.map(async (e) => ({
          profileId: e.id,
          specialties: e.trade_specialties,
          active: e.active,
          currentLoad: await ordersRepo.countActiveByEstimator(tx, e.id),
          maxConcurrent: e.max_concurrent_orders,
        })),
      );
      const picked = pickEstimator(candidates, order.requested_trades);
      if (!picked) return { assigned: false, order };
      await assignTo(tx, order, picked.profileId, actor);
      return {
        assigned: true,
        estimatorId: picked.profileId,
        order: (await ordersRepo.getById(tx, orderId))!,
      };
    });
  },

  /** Manually (re)assign an order to a specific estimator (admin override); syncs both capacities. */
  async reassign(db: DB, orderId: string, targetProfileId: string, actor: Actor): Promise<Order> {
    return db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order) throw NotFound();
      const target = await serviceProfilesRepo.getById(tx, targetProfileId);
      if (!target || target.role !== 'SERVICE_ESTIMATOR' || !target.active) {
        throw ValidationFailed('Target is not an active estimator', 'estimatorId');
      }
      const previous = order.assigned_estimator_id;
      await assignTo(tx, order, targetProfileId, actor);
      if (previous && previous !== targetProfileId) await recomputeCapacity(tx, previous);
      return (await ordersRepo.getById(tx, orderId))!;
    });
  },

  /** Isolation gate (the caveat): deny a SERVICE_ESTIMATOR access to an order not assigned to them. */
  assertEstimatorCanAccessOrder(order: Order, estimatorProfileId: string): void {
    if (order.assigned_estimator_id !== estimatorProfileId) {
      throw Forbidden('This order is not assigned to you');
    }
  },
};
