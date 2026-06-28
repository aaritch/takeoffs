import type { SubscriptionView } from '@takeoff/contracts';
import { entitlementsForTier } from './catalog';
import type { Subscription } from './repository';

export function subscriptionToView(s: Subscription): SubscriptionView {
  return {
    id: s.id,
    orgId: s.org_id,
    providerCustomerRef: s.provider_customer_ref,
    providerSubscriptionRef: s.provider_subscription_ref,
    status: s.status,
    planTier: s.plan_tier,
    seatLimit: s.seat_limit,
    currentPeriodEnd: s.current_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    entitlements: entitlementsForTier(s.plan_tier),
    createdAt: s.created_at.toISOString(),
  };
}
