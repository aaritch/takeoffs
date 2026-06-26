import type { pricingRules } from '../../data/schema';

/**
 * Pure pricing/turnaround engine (P3-02). A quote is computed from a {@link PricingRule} row and the
 * order's size (trade count + sheet count) — the numbers live in data, never code, so the business
 * tunes pricing without a deploy. A rule is validated so no combination can ever yield a zero or
 * negative price (the caveat); the compute also asserts a positive result as defense in depth.
 */

export type PricingRule = typeof pricingRules.$inferSelect;
export type NewPricingRule = typeof pricingRules.$inferInsert;

export interface QuoteInputs {
  tradeCount: number;
  sheetCount: number;
}

export interface Quote {
  priceQuoteMinor: number;
  promisedTurnaroundHours: number;
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

/**
 * Reject a rule whose numbers could ever produce a non-positive price or turnaround: the base must
 * be positive and every per-unit amount non-negative (so price ≥ base > 0 for any order size).
 * Called when seeding/editing rules, so bad config fails loudly at write time, not at quote time.
 */
export function validatePricingRule(rule: NewPricingRule): void {
  const nonNegative: [string, number | undefined][] = [
    ['per_trade_price_minor', rule.per_trade_price_minor],
    ['per_sheet_price_minor', rule.per_sheet_price_minor],
    ['per_trade_hours', rule.per_trade_hours],
    ['per_sheet_hours', rule.per_sheet_hours],
  ];
  if (!(rule.base_price_minor > 0)) {
    throw new PricingError(`base_price_minor must be > 0 (${rule.service_tier}/${rule.priority})`);
  }
  if (!(rule.base_turnaround_hours > 0)) {
    throw new PricingError(
      `base_turnaround_hours must be > 0 (${rule.service_tier}/${rule.priority})`,
    );
  }
  for (const [name, value] of nonNegative) {
    if (value !== undefined && value < 0) {
      throw new PricingError(`${name} must be ≥ 0 (${rule.service_tier}/${rule.priority})`);
    }
  }
}

export function computeQuote(rule: PricingRule, inputs: QuoteInputs): Quote {
  const trades = Math.max(0, inputs.tradeCount);
  const sheets = Math.max(0, inputs.sheetCount);
  const priceQuoteMinor =
    rule.base_price_minor +
    rule.per_trade_price_minor * trades +
    rule.per_sheet_price_minor * sheets;
  const promisedTurnaroundHours =
    rule.base_turnaround_hours + rule.per_trade_hours * trades + rule.per_sheet_hours * sheets;
  // Defense in depth: a validated rule can never reach here, but never emit a free/negative quote.
  if (!(priceQuoteMinor > 0)) {
    throw new PricingError('Computed a non-positive price — pricing rule is misconfigured');
  }
  return { priceQuoteMinor, promisedTurnaroundHours };
}
