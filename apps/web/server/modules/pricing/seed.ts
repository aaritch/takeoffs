import { and, eq } from 'drizzle-orm';
import type { DB } from '../../data/client';
import { pricingRules } from '../../data/schema';
import { validatePricingRule, type NewPricingRule } from './engine';

/**
 * PROVISIONAL default pricing/turnaround rules (P3-02). These are an engineering placeholder so the
 * managed-service flow works end to end — the owner/founder sets the real numbers (STATE §7 TBD).
 * RUSH carries a higher price and a shorter turnaround than STANDARD for the same tier.
 * Money is integer minor units (cents); turnaround is whole hours.
 */
export const PRICING_SEED: NewPricingRule[] = [
  {
    service_tier: 'SINGLE_TRADE',
    priority: 'STANDARD',
    base_price_minor: 15000,
    per_trade_price_minor: 0,
    per_sheet_price_minor: 300,
    base_turnaround_hours: 48,
    per_trade_hours: 0,
    per_sheet_hours: 1,
  },
  {
    service_tier: 'SINGLE_TRADE',
    priority: 'RUSH',
    base_price_minor: 25000,
    per_trade_price_minor: 0,
    per_sheet_price_minor: 500,
    base_turnaround_hours: 24,
    per_trade_hours: 0,
    per_sheet_hours: 1,
  },
  {
    service_tier: 'FULL_PROJECT',
    priority: 'STANDARD',
    base_price_minor: 40000,
    per_trade_price_minor: 5000,
    per_sheet_price_minor: 300,
    base_turnaround_hours: 72,
    per_trade_hours: 4,
    per_sheet_hours: 1,
  },
  {
    service_tier: 'FULL_PROJECT',
    priority: 'RUSH',
    base_price_minor: 70000,
    per_trade_price_minor: 8000,
    per_sheet_price_minor: 500,
    base_turnaround_hours: 36,
    per_trade_hours: 2,
    per_sheet_hours: 1,
  },
  {
    service_tier: 'RETAINER_DRAW',
    priority: 'STANDARD',
    base_price_minor: 30000,
    per_trade_price_minor: 4000,
    per_sheet_price_minor: 250,
    base_turnaround_hours: 60,
    per_trade_hours: 3,
    per_sheet_hours: 1,
  },
  {
    service_tier: 'RETAINER_DRAW',
    priority: 'RUSH',
    base_price_minor: 50000,
    per_trade_price_minor: 6000,
    per_sheet_price_minor: 400,
    base_turnaround_hours: 30,
    per_trade_hours: 2,
    per_sheet_hours: 1,
  },
];

/**
 * Load the global default pricing rules (no org_id). Idempotent + non-destructive: an existing
 * (tier, priority) row is left untouched, so business-tuned values survive a re-deploy (mirrors the
 * trade seed). MUST run via the admin connection. Each row is validated before insert.
 */
export async function seedGlobalPricingRules(db: DB): Promise<void> {
  for (const rule of PRICING_SEED) {
    const existing = await db.query.pricingRules.findFirst({
      where: and(
        eq(pricingRules.service_tier, rule.service_tier),
        eq(pricingRules.priority, rule.priority),
      ),
    });
    if (!existing) {
      validatePricingRule(rule);
      await db.insert(pricingRules).values(rule);
    }
  }
}
