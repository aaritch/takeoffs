import { describe, expect, it } from 'vitest';
import { PricingError, computeQuote, validatePricingRule, type PricingRule } from './engine';

function rule(over: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'r1',
    service_tier: 'FULL_PROJECT',
    priority: 'STANDARD',
    base_price_minor: 40000,
    per_trade_price_minor: 5000,
    per_sheet_price_minor: 300,
    base_turnaround_hours: 72,
    per_trade_hours: 4,
    per_sheet_hours: 1,
    created_at: new Date(0),
    updated_at: new Date(0),
    deleted_at: null,
    ...over,
  } as PricingRule;
}

describe('pricing engine (P3-02)', () => {
  it('computes price + turnaround = base + per-trade·trades + per-sheet·sheets', () => {
    const q = computeQuote(rule(), { tradeCount: 2, sheetCount: 3 });
    expect(q.priceQuoteMinor).toBe(40000 + 5000 * 2 + 300 * 3); // 50,900
    expect(q.promisedTurnaroundHours).toBe(72 + 4 * 2 + 1 * 3); // 83
  });

  it('a zero-size order still costs the base price (never free)', () => {
    const q = computeQuote(rule(), { tradeCount: 0, sheetCount: 0 });
    expect(q.priceQuoteMinor).toBe(40000);
    expect(q.priceQuoteMinor).toBeGreaterThan(0);
  });

  it('validatePricingRule rejects config that could ever yield a non-positive price', () => {
    expect(() => validatePricingRule(rule({ base_price_minor: 0 }))).toThrow(PricingError);
    expect(() => validatePricingRule(rule({ base_price_minor: -1 }))).toThrow(PricingError);
    expect(() => validatePricingRule(rule({ per_sheet_price_minor: -10 }))).toThrow(PricingError);
    expect(() => validatePricingRule(rule({ base_turnaround_hours: 0 }))).toThrow(PricingError);
    expect(() => validatePricingRule(rule())).not.toThrow();
  });

  it('computeQuote refuses to emit a non-positive quote (defense in depth)', () => {
    // A rule that slipped validation: base 0 → price 0 with no per-unit → must throw, never quote free.
    expect(() =>
      computeQuote(
        rule({ base_price_minor: 0, per_trade_price_minor: 0, per_sheet_price_minor: 0 }),
        {
          tradeCount: 0,
          sheetCount: 0,
        },
      ),
    ).toThrow(PricingError);
  });
});
