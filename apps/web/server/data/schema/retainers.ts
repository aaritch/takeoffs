import { bigint, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';

/**
 * Retainer — an org's prepaid managed-service balance (spec §11.5). **Stub for P3-03**: just a
 * balance an order can draw against at placement; the full retainer lifecycle (top-ups, draw
 * history, low-balance alerts) lands in Phase 4 (P4-03). `org_id` is the RLS key. Money is integer
 * minor units. One retainer per org.
 */
export const retainers = pgTable(
  'retainers',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    balance_minor: bigint('balance_minor', { mode: 'number' }).notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('retainers_org_unique').on(t.org_id)],
);
