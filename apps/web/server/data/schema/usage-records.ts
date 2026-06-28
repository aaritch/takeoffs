import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { UsageMetric } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';

/**
 * UsageRecord (spec §5.6) — meters a billable event: an AI takeoff run, a managed order, or an
 * export (P4-02). `org_id` is the RLS key. `reference_id` is the originating action's id (model run /
 * order / report); the unique (metric, reference_id) makes metering EXACTLY-ONCE relative to the
 * billable action — a retried action can't double-count. `period` ('YYYY-MM') is the quota window.
 * `billed` marks an overage (a record beyond the plan's included quota, to be charged).
 */
export const usageRecords = pgTable(
  'usage_records',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    metric: text('metric').$type<UsageMetric>().notNull(),
    quantity: integer('quantity').notNull().default(1),
    reference_id: uuid('reference_id').notNull(),
    period: text('period').notNull(),
    billed: boolean('billed').notNull().default(false),
    occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex('usage_records_metric_reference_unique').on(t.metric, t.reference_id)],
);
