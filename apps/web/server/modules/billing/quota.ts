import type { Entitlements, UsageMetric } from '@takeoff/contracts';

/**
 * Quota enforcement (P4-02), pure. A metric's monthly limit comes from the plan's {@link Entitlements};
 * a policy decides what crossing the limit does. `-1` means unlimited. The concrete policies are a
 * business decision (provisional — STATE §7 TBD).
 */

export type QuotaPolicy = 'BLOCK' | 'WARN' | 'OVERAGE';
export type QuotaOutcome = 'ALLOW' | 'WARN' | 'ALLOW_OVERAGE' | 'BLOCK';

/**
 * What happens when each metered event would cross its plan quota (provisional):
 * - AI runs: BLOCK — GPU work is a hard, paid quota.
 * - Exports: OVERAGE — allowed, but the over-quota record is billed.
 * - Managed orders: OVERAGE — never count-capped (each is paid per-order at placement); always metered.
 */
export const QUOTA_POLICY: Readonly<Record<UsageMetric, QuotaPolicy>> = {
  AI_TAKEOFF_RUN: 'BLOCK',
  EXPORT: 'OVERAGE',
  MANAGED_ORDER: 'OVERAGE',
};

/**
 * The monthly limit a plan grants for a metric (`-1` = unlimited; `0` = not included).
 *
 * Managed orders are unlimited because they're billed per-order at placement, not against a monthly
 * count — the `managedOrders` entitlement gates the self-serve *ordering* path, not placement here.
 */
export function metricLimit(entitlements: Entitlements, metric: UsageMetric): number {
  switch (metric) {
    case 'AI_TAKEOFF_RUN':
      return entitlements.aiTakeoffRunsPerMonth;
    case 'EXPORT':
      return entitlements.exportsPerMonth;
    case 'MANAGED_ORDER':
      return -1;
  }
}

export interface QuotaDecision {
  outcome: QuotaOutcome;
  overQuota: boolean;
  /** Seats left before the limit; `-1` for unlimited. */
  remaining: number;
}

/**
 * Decide whether an event is permitted given prior usage. `used` is the count BEFORE this event, so
 * the boundary is `used >= limit`.
 */
export function quotaDecision(used: number, limit: number, policy: QuotaPolicy): QuotaDecision {
  if (limit < 0) return { outcome: 'ALLOW', overQuota: false, remaining: -1 };
  const overQuota = used >= limit;
  if (!overQuota) return { outcome: 'ALLOW', overQuota: false, remaining: limit - used };
  switch (policy) {
    case 'BLOCK':
      return { outcome: 'BLOCK', overQuota: true, remaining: 0 };
    case 'WARN':
      return { outcome: 'WARN', overQuota: true, remaining: 0 };
    case 'OVERAGE':
      return { outcome: 'ALLOW_OVERAGE', overQuota: true, remaining: 0 };
  }
}

/** The billing period ('YYYY-MM', UTC) a timestamp falls in — the quota window. */
export function billingPeriod(at: Date): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
