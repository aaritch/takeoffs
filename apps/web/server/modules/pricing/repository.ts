import { and, asc, eq } from 'drizzle-orm';
import type { OrderPriority, ServiceTier } from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { pricingRules } from '../../data/schema';
import type { PricingRule } from './engine';

/**
 * PricingRule data access. The table is PLATFORM-global (no org_id), so reads are safe from any
 * org scope; writes go through the admin connection (the seed), never a customer request.
 */
export const pricingRulesRepo = {
  async get(
    tx: OrgScopedTx,
    serviceTier: ServiceTier,
    priority: OrderPriority,
  ): Promise<PricingRule | undefined> {
    return tx.query.pricingRules.findFirst({
      where: and(eq(pricingRules.service_tier, serviceTier), eq(pricingRules.priority, priority)),
    });
  },

  async list(tx: OrgScopedTx): Promise<PricingRule[]> {
    return tx.query.pricingRules.findMany({
      orderBy: [asc(pricingRules.service_tier), asc(pricingRules.priority)],
    });
  },
};
