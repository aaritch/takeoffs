import { eq } from 'drizzle-orm';
import type { MetricUsageView, UsageMetric, UsageSummaryView } from '@takeoff/contracts';
import { UsageMetric as UsageMetricEnum } from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { organizations } from '../../data/schema';
import { entitlementsForTier } from './catalog';
import { QuotaExceeded } from './errors';
import {
  QUOTA_POLICY,
  billingPeriod,
  metricLimit,
  quotaDecision,
  type QuotaDecision,
} from './quota';
import { usageRecordsRepo } from './usage-repo';

async function planTierFor(tx: OrgScopedTx, orgId: string) {
  const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  // No subscription row yet ⇒ FREE entitlements (the org default).
  return org?.plan_tier ?? 'FREE';
}

export interface MeterInput {
  orgId: string;
  metric: UsageMetric;
  /** The billable action's id (model run / order / report) — the exactly-once key. */
  referenceId: string;
  /** Defaults to now; pass for deterministic period selection in tests. */
  at?: Date;
}

/**
 * Usage metering & quotas (P4-02). The single seam every billable action calls: it enforces the
 * plan quota and records the event exactly-once, IN THE ACTION'S TRANSACTION, so a rolled-back action
 * leaves no usage and a retried one can't double-count.
 */
export const meteringService = {
  /**
   * Enforce the quota for `metric` and record the event. Throws {@link QuotaExceeded} when the plan's
   * policy BLOCKs at the limit (no record written; the caller's tx rolls back). Otherwise records the
   * event — flagged `billed` when it's an over-quota overage — and returns the decision.
   */
  async meter(tx: OrgScopedTx, input: MeterInput): Promise<QuotaDecision> {
    const at = input.at ?? new Date();
    const period = billingPeriod(at);
    const tier = await planTierFor(tx, input.orgId);
    const limit = metricLimit(entitlementsForTier(tier), input.metric);
    const used = await usageRecordsRepo.countForPeriod(tx, input.orgId, input.metric, period);
    const decision = quotaDecision(used, limit, QUOTA_POLICY[input.metric]);

    if (decision.outcome === 'BLOCK') {
      throw QuotaExceeded(
        `Plan quota reached for ${input.metric} (${used}/${limit} this period). Upgrade to continue.`,
      );
    }

    await usageRecordsRepo.record(tx, {
      org_id: input.orgId,
      metric: input.metric,
      reference_id: input.referenceId,
      period,
      quantity: 1,
      billed: decision.overQuota,
      occurred_at: at,
    });
    return decision;
  },

  /** The org's usage this period across every metered metric, against plan limits (for the customer). */
  async summarize(
    tx: OrgScopedTx,
    orgId: string,
    at: Date = new Date(),
  ): Promise<UsageSummaryView> {
    const period = billingPeriod(at);
    const tier = await planTierFor(tx, orgId);
    const entitlements = entitlementsForTier(tier);
    const metrics: MetricUsageView[] = [];
    for (const metric of UsageMetricEnum.options) {
      const limit = metricLimit(entitlements, metric);
      const used = await usageRecordsRepo.countForPeriod(tx, orgId, metric, period);
      metrics.push({
        metric,
        used,
        limit,
        remaining: limit < 0 ? -1 : Math.max(0, limit - used),
        overQuota: limit >= 0 && used >= limit,
      });
    }
    return { period, planTier: tier, metrics };
  },
};
