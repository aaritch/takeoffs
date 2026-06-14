import { doublePrecision, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type {
  GeometryType,
  MeasurementGeometry,
  MeasurementSource,
  ReviewStatus,
} from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { conditions } from './conditions';

/**
 * Measurement — one geometric object attached to a condition (spec §5.3). Geometry is stored in
 * normalized sheet coordinates as JSONB; `raw_value` is the SERVER-computed real-world quantity
 * (base units, before factors), the authoritative number rollups sum. The client never supplies
 * a quantity — only geometry — so totals cannot be tampered with (P1-11). (PostGIS geometry
 * columns + spatial math are deferred until spatial ops are needed; see STATE §7.)
 *
 * `sheet_id` is a plain uuid for now — the sheets table lands with ingestion (P1-02+).
 */
export const measurements = pgTable(
  'measurements',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    condition_id: uuid('condition_id')
      .notNull()
      .references(() => conditions.id),
    sheet_id: uuid('sheet_id'),
    geom_type: text('geom_type').$type<GeometryType>().notNull(),
    geometry: jsonb('geometry').$type<MeasurementGeometry>().notNull(),
    raw_value: doublePrecision('raw_value').notNull(),
    source: text('source').$type<MeasurementSource>().notNull().default('MANUAL'),
    ai_confidence: doublePrecision('ai_confidence'),
    review_status: text('review_status').$type<ReviewStatus>().notNull().default('UNREVIEWED'),
    created_by_user_id: uuid('created_by_user_id'),
    model_run_id: uuid('model_run_id'),
    ...timestamps,
  },
  (t) => [
    index('measurements_org_idx').on(t.org_id),
    index('measurements_condition_idx').on(t.condition_id),
  ],
);
