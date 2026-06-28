import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { GeometryType, MeasurementGeometry, MeasurementType } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { takeoffs } from './takeoffs';
import { conditions } from './conditions';

/**
 * Assembly (spec §6.5, P4-07) — one drawn geometry that drives MULTIPLE conditions at once (e.g. a
 * wall driving stud, drywall, and track quantities). An assembly belongs to a takeoff and has a
 * driver measurement type (the geometry kind drawn); each `assembly_component` links a child
 * condition with an EXPLICIT multiplier factor. The relationship + factors are first-class and
 * visible — never a hidden multiplier (the caveat).
 */
export const assemblies = pgTable(
  'assemblies',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    takeoff_id: uuid('takeoff_id')
      .notNull()
      .references(() => takeoffs.id),
    name: text('name').notNull(),
    driver_measurement_type: text('driver_measurement_type').$type<MeasurementType>().notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('assemblies_takeoff_idx').on(t.takeoff_id)],
);

/**
 * Assembly component (P4-07) — a child condition driven by an assembly, with the explicit `factor`
 * applied to the driver's base quantity (e.g. studs-per-foot). One component per (assembly, condition).
 */
export const assemblyComponents = pgTable(
  'assembly_components',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    assembly_id: uuid('assembly_id')
      .notNull()
      .references(() => assemblies.id),
    condition_id: uuid('condition_id')
      .notNull()
      .references(() => conditions.id),
    factor: doublePrecision('factor').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('assembly_components_unique')
      .on(t.assembly_id, t.condition_id)
      .where(sql`${t.deleted_at} is null`),
    index('assembly_components_condition_idx').on(t.condition_id),
  ],
);

/**
 * Assembly instance (P4-07) — ONE drawn geometry against an assembly. `base_value` is the SERVER-
 * computed real-world quantity of the driver geometry (same conversion as a measurement); each child
 * condition's contribution is `base_value × component.factor`. Stored once, so editing the geometry
 * recomputes every linked condition consistently.
 */
export const assemblyInstances = pgTable(
  'assembly_instances',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    assembly_id: uuid('assembly_id')
      .notNull()
      .references(() => assemblies.id),
    sheet_id: uuid('sheet_id'),
    geom_type: text('geom_type').$type<GeometryType>().notNull(),
    geometry: jsonb('geometry').$type<MeasurementGeometry>().notNull(),
    base_value: doublePrecision('base_value').notNull(),
    ...timestamps,
  },
  (t) => [index('assembly_instances_assembly_idx').on(t.assembly_id)],
);
