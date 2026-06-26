// Pricing module (P3-02) — the configurable managed-service pricing/turnaround engine. Rules are
// PLATFORM-global data (no org_id), tuned by the business without a deploy; the engine is pure and
// guarantees a positive quote. Quoting an order (DRAFT → QUOTED) lives in the orders module.
export { computeQuote, validatePricingRule, PricingError } from './engine';
export type { PricingRule, NewPricingRule, Quote, QuoteInputs } from './engine';
export { pricingRulesRepo } from './repository';
export { seedGlobalPricingRules, PRICING_SEED } from './seed';
export { pricingRuleToView } from './view';
