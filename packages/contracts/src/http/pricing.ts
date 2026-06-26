import { z } from 'zod';
import { OrderPriority, ServiceTier } from '../enums';

/** A managed-service pricing/turnaround rule (P3-02). Money is integer minor units; time is hours. */
export const PricingRuleView = z.object({
  id: z.string().uuid(),
  serviceTier: ServiceTier,
  priority: OrderPriority,
  basePriceMinor: z.number().int(),
  perTradePriceMinor: z.number().int(),
  perSheetPriceMinor: z.number().int(),
  baseTurnaroundHours: z.number().int(),
  perTradeHours: z.number().int(),
  perSheetHours: z.number().int(),
});
export type PricingRuleView = z.infer<typeof PricingRuleView>;

export const PricingRulesListResponse = z.object({ rules: z.array(PricingRuleView) });
export type PricingRulesListResponse = z.infer<typeof PricingRulesListResponse>;
