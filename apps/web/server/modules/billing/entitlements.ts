import type { OrganizationStatus, PlanTier, SubscriptionStatus } from '@takeoff/contracts';
import { entitlementsForTier } from './catalog';

export interface OrgEntitlementState {
  planTier: PlanTier;
  seatLimit: number;
  orgStatus: OrganizationStatus;
}

/**
 * Derive an org's entitlement state from its subscription (P4-01) — a PURE mapping from provider
 * subscription status + tier to what the org is allowed: its effective plan, seat limit, and account
 * status. This is the single place subscription state becomes org access, so the rules are explicit
 * and exhaustively testable.
 *
 * - TRIALING / ACTIVE  → full entitlements of the paid tier; account ACTIVE.
 * - PAST_DUE           → keep the tier (payment is failing, not gone) but restrict the account to
 *                        PAST_DUE — the correct restricted state (the caveat).
 * - PAUSED             → SUSPENDED (access withdrawn while paused), tier retained.
 * - CANCELED           → drop to FREE; the account returns to ACTIVE as a free org.
 * - INCOMPLETE         → not yet started; treat as FREE/ACTIVE until it activates.
 */
export function deriveOrgEntitlements(
  status: SubscriptionStatus,
  planTier: PlanTier,
): OrgEntitlementState {
  switch (status) {
    case 'TRIALING':
    case 'ACTIVE':
      return { planTier, seatLimit: entitlementsForTier(planTier).seatLimit, orgStatus: 'ACTIVE' };
    case 'PAST_DUE':
      return {
        planTier,
        seatLimit: entitlementsForTier(planTier).seatLimit,
        orgStatus: 'PAST_DUE',
      };
    case 'PAUSED':
      return {
        planTier,
        seatLimit: entitlementsForTier(planTier).seatLimit,
        orgStatus: 'SUSPENDED',
      };
    case 'CANCELED':
    case 'INCOMPLETE':
      return {
        planTier: 'FREE',
        seatLimit: entitlementsForTier('FREE').seatLimit,
        orgStatus: 'ACTIVE',
      };
  }
}
