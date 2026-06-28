import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { primaryId } from './columns';

/**
 * DR drill run (P5-01) — the durable record of a disaster-recovery restore drill, so "drills run on a
 * schedule" is auditable (the last run + its outcome are queryable). Platform-global operations
 * data — NO `org_id` (not customer-owned), so it is correctly exempt from the org-RLS guard, like
 * billing_events. Append-only.
 */
export const drDrillRuns = pgTable('dr_drill_runs', {
  id: primaryId(),
  status: text('status').notNull(), // 'PASSED' | 'FAILED'
  integrity_ok: boolean('integrity_ok').notNull(),
  restored_row_count: integer('restored_row_count').notNull(),
  data_loss_seconds: doublePrecision('data_loss_seconds').notNull(),
  recovery_seconds: doublePrecision('recovery_seconds').notNull(),
  within_rpo: boolean('within_rpo').notNull(),
  within_rto: boolean('within_rto').notNull(),
  report: jsonb('report').$type<Record<string, unknown>>().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
