import type { DB } from '../../data/client';
import type { OrgScopedTx } from '../../data/org-scope';
import { NotFound } from '../orders/errors';
import { ordersRepo, type Order } from '../orders/repository';
import { ordersService, DISPUTE_WINDOW_HOURS, type Actor } from '../orders';
import { loggingOrderNotifier, type OrderNotifier } from './notifier';

/**
 * Delivery → acceptance / dispute (P3-07). After QA delivers, the CUSTOMER accepts (→ ACCEPTED,
 * terminal — the payout trigger in Phase 4) or disputes within the window (→ DISPUTED); if they do
 * neither, the order auto-accepts after the window. Accept/dispute are customer actions (org-scoped);
 * the auto-accept sweep is a platform/system job (cross-org). No payout is released here — that's
 * gated to ACCEPTED/auto-accept in Phase 4 (the caveat).
 */

interface Deps {
  notifier: OrderNotifier;
}
const defaults: Deps = { notifier: loggingOrderNotifier };

/** The audit actor for an automated (no-human) transition like the auto-accept sweep. */
const SYSTEM_ACTOR: Actor = { userId: '00000000-0000-0000-0000-000000000000', role: 'SYSTEM' };

export const deliveryService = {
  /** The customer accepts a delivered order → ACCEPTED (terminal). */
  async accept(
    tx: OrgScopedTx,
    orderId: string,
    actor: Actor,
    deps: Deps = defaults,
  ): Promise<Order> {
    const order = await ordersRepo.getById(tx, orderId);
    if (!order) throw NotFound();
    const accepted = await ordersService.transition(tx, orderId, 'ACCEPTED', actor, {
      payload: { acceptedBy: 'CUSTOMER' },
    });
    await deps.notifier.accepted({ orderId, orgId: order.org_id });
    return accepted;
  },

  /** The customer opens a dispute on a delivered order → DISPUTED, pausing progression. */
  async dispute(
    tx: OrgScopedTx,
    orderId: string,
    actor: Actor,
    reason: string,
    deps: Deps = defaults,
  ): Promise<Order> {
    const order = await ordersRepo.getById(tx, orderId);
    if (!order) throw NotFound();
    const disputed = await ordersService.transition(tx, orderId, 'DISPUTED', actor, {
      payload: { reason },
    });
    await deps.notifier.disputed({ orderId, orgId: order.org_id, reason });
    return disputed;
  },

  /**
   * Auto-accept every delivered order whose dispute window has lapsed (delivered_at + window ≤ now).
   * A platform/system sweep (cross-org, admin connection); meant to be run on a schedule. Returns
   * the order ids auto-accepted. `now` is passed in for deterministic testing.
   */
  async autoAcceptExpired(db: DB, now: Date, deps: Deps = defaults): Promise<string[]> {
    const cutoff = new Date(now.getTime() - DISPUTE_WINDOW_HOURS * 3_600_000);
    return db.transaction(async (tx) => {
      const expired = await ordersRepo.listDeliveredBefore(tx, cutoff);
      const accepted: string[] = [];
      for (const order of expired) {
        await ordersService.transition(tx, order.id, 'ACCEPTED', SYSTEM_ACTOR, {
          payload: { autoAccepted: true },
        });
        await deps.notifier.accepted({ orderId: order.id, orgId: order.org_id });
        accepted.push(order.id);
      }
      return accepted;
    });
  },
};
