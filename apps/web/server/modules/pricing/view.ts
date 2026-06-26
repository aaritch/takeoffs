import type { PricingRuleView } from '@takeoff/contracts';
import type { PricingRule } from './engine';

export function pricingRuleToView(r: PricingRule): PricingRuleView {
  return {
    id: r.id,
    serviceTier: r.service_tier,
    priority: r.priority,
    basePriceMinor: r.base_price_minor,
    perTradePriceMinor: r.per_trade_price_minor,
    perSheetPriceMinor: r.per_sheet_price_minor,
    baseTurnaroundHours: r.base_turnaround_hours,
    perTradeHours: r.per_trade_hours,
    perSheetHours: r.per_sheet_hours,
  };
}
