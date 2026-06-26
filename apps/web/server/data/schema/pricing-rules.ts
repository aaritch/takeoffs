import { bigint, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type { OrderPriority, ServiceTier } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';

/**
 * PricingRule — the managed-service pricing/turnaround config (P3-02). One row per
 * (service_tier, priority): a quote is `base + per_trade·trades + per_sheet·sheets`, and the
 * promised turnaround the same shape in hours. RUSH rows carry their own (higher price / shorter
 * turnaround) numbers — the data IS the config, so the business tunes pricing by editing rows, with
 * no code change (spec §11.3). This is PLATFORM-global config (no `org_id`); customers never edit it.
 */
export const pricingRules = pgTable(
  'pricing_rules',
  {
    id: primaryId(),
    service_tier: text('service_tier').$type<ServiceTier>().notNull(),
    priority: text('priority').$type<OrderPriority>().notNull(),
    base_price_minor: bigint('base_price_minor', { mode: 'number' }).notNull(),
    per_trade_price_minor: bigint('per_trade_price_minor', { mode: 'number' }).notNull().default(0),
    per_sheet_price_minor: bigint('per_sheet_price_minor', { mode: 'number' }).notNull().default(0),
    base_turnaround_hours: integer('base_turnaround_hours').notNull(),
    per_trade_hours: integer('per_trade_hours').notNull().default(0),
    per_sheet_hours: integer('per_sheet_hours').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('pricing_rules_tier_priority_unique').on(t.service_tier, t.priority)],
);
