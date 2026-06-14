import { bigint, doublePrecision, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { MeasurementType, Unit } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { takeoffs } from './takeoffs';
import { tradeCategories } from './trade-categories';

/**
 * Condition — a named, trade-specific quantity definition within a takeoff (spec §5.3). The
 * measurement_type/unit pairing is validated at the service boundary (their dimensions must
 * match). `depth_or_height` is the EXPLICIT opt-in to a derivation: an AREA condition derives
 * VOLUME only when a depth is set; a LINEAR condition derives wall SURFACE_AREA only when a
 * height is set — never assumed (spec §6.5 / P1-10 caveat). Money (`unit_cost_minor`) is integer
 * minor units.
 */
export const conditions = pgTable(
  'conditions',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    takeoff_id: uuid('takeoff_id')
      .notNull()
      .references(() => takeoffs.id),
    trade_category_id: uuid('trade_category_id')
      .notNull()
      .references(() => tradeCategories.id),
    name: text('name').notNull(),
    measurement_type: text('measurement_type').$type<MeasurementType>().notNull(),
    unit: text('unit').$type<Unit>().notNull(),
    color_hex: text('color_hex'),
    depth_or_height: doublePrecision('depth_or_height'),
    waste_factor_pct: doublePrecision('waste_factor_pct').notNull().default(0),
    unit_cost_minor: bigint('unit_cost_minor', { mode: 'number' }),
    notes: text('notes'),
    ai_object_class: text('ai_object_class'),
    ...timestamps,
  },
  (t) => [
    index('conditions_org_idx').on(t.org_id),
    index('conditions_takeoff_idx').on(t.takeoff_id),
  ],
);
