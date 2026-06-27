import type { DB } from '../../data/client';
import { NotFound, ValidationFailed } from '../orders/errors';
import { ordersRepo, type Order } from '../orders/repository';
import { ordersService, type Actor } from '../orders';
import { takeoffsRepo } from '../takeoffs/repository';
import { assignmentService } from './assignment';

/**
 * Fulfillment in the SHARED editor (P3-05). The assigned estimator works the customer's plan set in
 * the exact same tools a self-serve user has — there is NO separate fulfillment editor (the caveat;
 * reuse keeps quality consistent). This service only does the order-side bookkeeping: open the work
 * (ASSIGNED → IN_PROGRESS) and create the MANAGED_SERVICE takeoff the estimator then builds with the
 * standard condition/measurement/candidate-review services. Cross-org (platform/admin connection),
 * gated by the assignment so an estimator only ever touches orders assigned to them.
 */

export interface FulfillmentStart {
  order: Order;
  takeoffId: string;
}

export const fulfillmentService = {
  /** Begin fulfilling an assigned order: create its managed-service takeoff and move to IN_PROGRESS. */
  async start(
    db: DB,
    orderId: string,
    estimatorProfileId: string,
    actor: Actor,
  ): Promise<FulfillmentStart> {
    return db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order) throw NotFound();
      assignmentService.assertEstimatorCanAccessOrder(order, estimatorProfileId);
      if (!order.plan_set_id) {
        throw ValidationFailed('Order has no plan set to take off', 'planSetId');
      }
      // The deliverable: a takeoff in the CUSTOMER's org, marked managed-service origin.
      const takeoff = await takeoffsRepo.insert(tx, {
        org_id: order.org_id,
        project_id: order.project_id,
        plan_set_id: order.plan_set_id,
        origin: 'MANAGED_SERVICE',
        created_by_user_id: actor.userId,
      });
      const updated = await ordersService.transition(tx, orderId, 'IN_PROGRESS', actor, {
        set: { delivered_takeoff_id: takeoff.id },
        payload: { takeoffId: takeoff.id },
      });
      return { order: updated, takeoffId: takeoff.id };
    });
  },

  /**
   * The order an assigned estimator is working — the access point that backs the editor. Throws if
   * the estimator isn't assigned to it (the isolation caveat).
   */
  async forEstimator(db: DB, orderId: string, estimatorProfileId: string): Promise<Order> {
    return db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order) throw NotFound();
      assignmentService.assertEstimatorCanAccessOrder(order, estimatorProfileId);
      return order;
    });
  },
};
