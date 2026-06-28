import type { PayoutView } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { ValidationFailed } from '../source-files/errors';
import { stubPayoutProvider, type PayoutProvider } from '../payments';
import { ordersRepo } from '../orders/repository';
import { serviceProfilesRepo } from './repository';
import { payoutRecordsRepo, type PayoutRecord } from './payout-repo';

export function payoutToView(p: PayoutRecord): PayoutView {
  return {
    id: p.id,
    serviceProfileId: p.service_profile_id,
    orderId: p.order_id,
    amountMinor: p.amount_minor,
    currency: p.currency,
    status: p.status,
    providerTransferRef: p.provider_transfer_ref,
    providerReversalRef: p.provider_reversal_ref,
    reversalReason: p.reversal_reason,
    settledAt: p.settled_at?.toISOString() ?? null,
    reversedAt: p.reversed_at?.toISOString() ?? null,
    createdAt: p.created_at.toISOString(),
  };
}

/**
 * Estimator share of a managed order's price (PROVISIONAL — the owner sets the real split, STATE §7
 * TBD). Engineering provides the mechanism; the rate is a business decision.
 */
export const ESTIMATOR_PAYOUT_RATE = 0.6;
const PAYOUT_CURRENCY = 'USD';

/** The estimator's payout for an order priced at `orderPriceMinor` (rounded to whole minor units). */
export function computePayoutAmount(orderPriceMinor: number, rate = ESTIMATOR_PAYOUT_RATE): number {
  return Math.round(orderPriceMinor * rate);
}

export interface PayoutDeps {
  provider: PayoutProvider;
  rate: number;
}
const defaults: PayoutDeps = { provider: stubPayoutProvider, rate: ESTIMATOR_PAYOUT_RATE };

/**
 * Estimator payouts (spec §11.5, P4-04 · GATE). Pays the assigned estimator for a fulfilled order —
 * and ONLY when that order is ACCEPTED (or auto-accepted). Payments out are higher-stakes than in:
 *
 *  - **The gate:** a payout is created strictly when `order.status === 'ACCEPTED'`. A DISPUTED or
 *    otherwise-unaccepted order produces NO payout. (Disputes never reach ACCEPTED, so they can't pay.)
 *  - **Exactly-once:** unique `order_id` → at most one payout per order; a re-run returns the existing
 *    record and never double-pays.
 *  - **Reconciliation:** the record is created PENDING and committed before the provider transfer; a
 *    failed transfer leaves it PENDING (owed, retriable), never silently lost.
 *
 * Runs on the platform/admin connection (payouts are cross-org, customer-invisible). Never call from a
 * client/unauthenticated path — the routes are platform-gated.
 */
export const payoutService = {
  /**
   * Create (if absent) and settle the payout for an accepted order. Returns the payout, or null when
   * there's nothing to pay (order not ACCEPTED, or no assigned estimator).
   */
  async processAcceptedOrder(
    db: DB,
    orderId: string,
    deps: PayoutDeps = defaults,
  ): Promise<PayoutRecord | null> {
    // 1) Gate + accrue (atomic): only an ACCEPTED order with an assigned estimator gets a payout.
    const accrued = await db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order || order.status !== 'ACCEPTED' || !order.assigned_estimator_id) return null;
      const amount = computePayoutAmount(order.price_quote_minor ?? 0, deps.rate);
      return payoutRecordsRepo.insertIfAbsent(tx, {
        service_profile_id: order.assigned_estimator_id,
        order_id: order.id,
        amount_minor: amount,
        currency: PAYOUT_CURRENCY,
        status: 'PENDING',
      });
    });
    if (!accrued || accrued.status !== 'PENDING') return accrued; // nothing to pay / already settled

    // 2) Settle via the provider (OUTSIDE the tx — an external side effect).
    const profile = await db.transaction((tx) =>
      serviceProfilesRepo.getById(tx, accrued.service_profile_id),
    );
    const result = await deps.provider.transfer({
      payoutId: accrued.id,
      estimatorAccountRef: profile?.payout_account_ref ?? '',
      amountMinor: accrued.amount_minor,
      currency: accrued.currency,
    });
    if (!result.ok) return accrued; // stays PENDING — owed, retriable (reconciliation)

    // 3) Mark PAID.
    return db.transaction((tx) =>
      payoutRecordsRepo.update(tx, accrued.id, {
        status: 'PAID',
        provider_transfer_ref: result.reference ?? null,
        settled_at: new Date(),
      }),
    );
  },

  /**
   * Reverse a settled payout (e.g. a dispute resolved against the estimator). Only a PAID payout can
   * be reversed; the prior amount + transfer ref are preserved for audit.
   */
  async reverse(
    db: DB,
    payoutId: string,
    reason: string,
    deps: PayoutDeps = defaults,
  ): Promise<PayoutRecord> {
    const payout = await db.transaction((tx) => payoutRecordsRepo.getById(tx, payoutId));
    if (!payout) throw ValidationFailed('Payout not found', { field: 'payoutId' });
    if (payout.status !== 'PAID') {
      throw ValidationFailed(`Only a PAID payout can be reversed (is ${payout.status})`, {
        field: 'status',
      });
    }
    const result = await deps.provider.reverse({
      transferRef: payout.provider_transfer_ref ?? '',
      amountMinor: payout.amount_minor,
    });
    if (!result.ok)
      throw ValidationFailed(result.reason ?? 'Reversal failed', { field: 'provider' });
    return db.transaction((tx) =>
      payoutRecordsRepo.update(tx, payoutId, {
        status: 'REVERSED',
        provider_reversal_ref: result.reference ?? null,
        reversal_reason: reason,
        reversed_at: new Date(),
      }),
    );
  },

  getByOrder(db: DB, orderId: string): Promise<PayoutRecord | undefined> {
    return db.transaction((tx) => payoutRecordsRepo.getByOrder(tx, orderId));
  },

  listForEstimator(db: DB, serviceProfileId: string): Promise<PayoutRecord[]> {
    return db.transaction((tx) => payoutRecordsRepo.listByEstimator(tx, serviceProfileId));
  },

  listAll(db: DB): Promise<PayoutRecord[]> {
    return db.transaction((tx) => payoutRecordsRepo.listAll(tx));
  },
};
