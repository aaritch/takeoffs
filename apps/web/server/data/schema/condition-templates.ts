import { sql } from 'drizzle-orm';
import { numeric, pgTable, text, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type { MeasurementType, Unit } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { tradeCategories } from './trade-categories';

/**
 * ConditionTemplate — the starter library of reusable condition definitions (spec §5.3 fields,
 * minus the takeoff-specific ones). Global rows (org_id NULL) are the seed library every org can
 * use and copy; per-org rows are customizations. A copy becomes a real `Condition` inside a
 * takeoff in Phase 1 (P1-10). `unit` must match `measurement_type`'s dimension (validated in the
 * seed test via contracts' isUnitValidFor).
 */
export const conditionTemplates = pgTable(
  'condition_templates',
  {
    id: primaryId(),
    org_id: uuid('org_id').references(() => organizations.id),
    trade_category_id: uuid('trade_category_id')
      .notNull()
      .references(() => tradeCategories.id),
    name: text('name').notNull(),
    measurement_type: text('measurement_type').$type<MeasurementType>().notNull(),
    unit: text('unit').$type<Unit>().notNull(),
    color_hex: text('color_hex'),
    default_waste_factor_pct: numeric('default_waste_factor_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    ai_object_class: text('ai_object_class'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('condition_templates_global_unique')
      .on(t.trade_category_id, t.name)
      .where(sql`${t.org_id} is null`),
    index('condition_templates_org_idx').on(t.org_id),
  ],
);
