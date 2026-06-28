import type { BillingSubscriptionEvent } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { organizations } from '../../data/schema';
import { eq } from 'drizzle-orm';
import { deriveOrgEntitlements } from './entitlements';
import { billingEventsRepo, subscriptionsRepo, type Subscription } from './repository';

export type ReconcileOutcome =
  | { applied: true; reason?: undefined; subscription: Subscription }
  | { applied: false; reason: 'duplicate' | 'stale' };

/**
 * Reconcile a normalized subscription webhook into durable state (P4-01). The provider is the source
 * of truth; this is the ONLY writer of billing-derived org entitlements. It is:
 *
 *  - **idempotent** — the same `providerEventId` is recorded once; a duplicate delivery is a no-op
 *    (the caveat: webhooks get retried/redelivered);
 *  - **order-safe** — an event older than the last one we applied (`occurredAt <= last_event_at`) is
 *    recorded but NOT applied, so an out-of-order delivery can't roll state backwards;
 *  - **fail-closed on entitlements** — subscription status maps to org plan/seats/status via the pure
 *    `deriveOrgEntitlements`, written in the SAME transaction as the subscription row.
 *
 * Runs on the admin connection (the provider's call has no org session; events are cross-org).
 */
export const billingWebhookService = {
  async handleEvent(db: DB, event: BillingSubscriptionEvent): Promise<ReconcileOutcome> {
    return db.transaction(async (tx) => {
      // 1. Idempotency gate: record the event exactly once.
      const fresh = await billingEventsRepo.recordOnce(tx, {
        provider_event_id: event.providerEventId,
        event_type: event.type,
        subscription_ref: event.subscriptionRef,
        org_ref: event.orgId,
        occurred_at: new Date(event.occurredAt),
      });
      if (!fresh) return { applied: false, reason: 'duplicate' };

      // 2. Out-of-order guard: never let an older event overwrite newer state.
      const occurredAt = new Date(event.occurredAt);
      const existing = await subscriptionsRepo.getByOrg(tx, event.orgId);
      if (existing && existing.last_event_at >= occurredAt) {
        return { applied: false, reason: 'stale' };
      }

      // 3. Upsert the subscription from the provider's payload (the authoritative billing state).
      const fields = {
        provider_customer_ref: event.customerRef,
        provider_subscription_ref: event.subscriptionRef,
        status: event.status,
        plan_tier: event.planTier,
        seat_limit: deriveOrgEntitlements(event.status, event.planTier).seatLimit,
        current_period_end: event.currentPeriodEnd ? new Date(event.currentPeriodEnd) : null,
        cancel_at_period_end: event.cancelAtPeriodEnd ?? false,
        last_event_at: occurredAt,
      };
      const subscription = existing
        ? await subscriptionsRepo.update(tx, existing.id, fields)
        : await subscriptionsRepo.insert(tx, { org_id: event.orgId, ...fields });

      // 4. Reconcile org entitlements (plan, seats, restricted state) — same transaction.
      const derived = deriveOrgEntitlements(event.status, event.planTier);
      await tx
        .update(organizations)
        .set({
          plan_tier: derived.planTier,
          seat_limit: derived.seatLimit,
          status: derived.orgStatus,
          billing_customer_ref: event.customerRef,
          updated_at: new Date(),
        })
        .where(eq(organizations.id, event.orgId));

      return { applied: true, subscription };
    });
  },
};
