import {
  bigint,
  doublePrecision,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { conditions } from './conditions';

/**
 * QuantityRollup — a denormalized, cached quantity per condition, recomputed server-side from
 * the authoritative measurement set whenever measurements change (spec §5.3 / §6.5). The client
 * reads these cached values (and a "recomputing" state when stale); it is NEVER the source of
 * truth. One row per condition.
 */
export const quantityRollups = pgTable(
  'quantity_rollups',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    condition_id: uuid('condition_id')
      .notNull()
      .references(() => conditions.id),
    base_quantity: doublePrecision('base_quantity').notNull().default(0),
    quantity_with_waste: doublePrecision('quantity_with_waste').notNull().default(0),
    derived_volume: doublePrecision('derived_volume'),
    derived_surface_area: doublePrecision('derived_surface_area'),
    extended_cost_minor: bigint('extended_cost_minor', { mode: 'number' }),
    measurement_count: integer('measurement_count').notNull().default(0),
    last_computed_at: timestamp('last_computed_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex('quantity_rollups_condition_unique').on(t.condition_id)],
);
