import { bigint, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { ReportFormat, ReportStatus, ReportTemplate } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { takeoffs } from './takeoffs';

/**
 * Report — a generated export of a takeoff (spec §8, P1-13). Created at request time with
 * status PENDING; the worker-exports job renders the template from the authoritative rollups,
 * writes the artifact to object storage (`storage_key`, org-namespaced), and flips it to READY.
 * The row IS the meterable usage record (per-takeoff/plan quota metering lands in Phase 4).
 * `org_id` is the RLS key (P0-07).
 */
export const reports = pgTable(
  'reports',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    takeoff_id: uuid('takeoff_id')
      .notNull()
      .references(() => takeoffs.id),
    template: text('template').$type<ReportTemplate>().notNull(),
    format: text('format').$type<ReportFormat>().notNull().default('CSV'),
    status: text('status').$type<ReportStatus>().notNull().default('QUEUED'),
    storage_key: text('storage_key'),
    file_name: text('file_name'),
    file_size_bytes: bigint('file_size_bytes', { mode: 'number' }),
    error_detail: text('error_detail'),
    ...timestamps,
  },
  (t) => [index('reports_org_idx').on(t.org_id), index('reports_takeoff_idx').on(t.takeoff_id)],
);
