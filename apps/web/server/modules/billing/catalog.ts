import type { Entitlements, PlanTier } from '@takeoff/contracts';

/**
 * Plan catalog (P4-01): what each tier grants. Seat limit is enforced against membership (P0-06);
 * the quota numbers feed usage metering (P4-02); `-1` means unlimited.
 *
 * These are PROVISIONAL product numbers — the owner sets the real values (STATE §7 TBD). They live in
 * code (not a DB table) because, unlike pricing, entitlements are a product definition the app's
 * authorization logic depends on; tuning them is a deploy, not a config edit.
 */
export const PLAN_CATALOG: Readonly<Record<PlanTier, Entitlements>> = {
  FREE: { seatLimit: 3, aiTakeoffRunsPerMonth: 0, exportsPerMonth: 5, managedOrders: false },
  STARTER: { seatLimit: 5, aiTakeoffRunsPerMonth: 25, exportsPerMonth: 50, managedOrders: true },
  PRO: { seatLimit: 20, aiTakeoffRunsPerMonth: 250, exportsPerMonth: 1000, managedOrders: true },
  RETAINER: { seatLimit: 50, aiTakeoffRunsPerMonth: -1, exportsPerMonth: -1, managedOrders: true },
};

export function entitlementsForTier(tier: PlanTier): Entitlements {
  return PLAN_CATALOG[tier];
}
