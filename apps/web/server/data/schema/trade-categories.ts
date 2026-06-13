import { sql } from 'drizzle-orm';
import { integer, pgTable, text, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';

/**
 * TradeCategory — top-level grouping for conditions (spec §5.3). `org_id` is NULL for the
 * global seed structure (available to every org) and set for an org's own customizations. The
 * org-isolation policy on this table exposes globals (org_id IS NULL) to everyone while keeping
 * per-org rows private (P0-07 / P0-10).
 */
export const tradeCategories = pgTable(
  'trade_categories',
  {
    id: primaryId(),
    org_id: uuid('org_id').references(() => organizations.id),
    name: text('name').notNull(),
    division_code: text('division_code').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // One global category per division code.
    uniqueIndex('trade_categories_global_division_unique')
      .on(t.division_code)
      .where(sql`${t.org_id} is null`),
    index('trade_categories_org_idx').on(t.org_id),
  ],
);
