// Trades module — the seed trade structure and starter condition library (P0-10), plus scoped
// reads of the catalog (global seed + per-org customizations).
export { seedGlobalTradeData } from './seed';
export { SEED_TRADES, SEED_CONDITION_COUNT } from './seed-data';
export type { SeedTrade, SeedCondition } from './seed-data';
export { tradesRepo } from './repository';
export type { TradeCategory, ConditionTemplate } from './repository';
