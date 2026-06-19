import { pgTable, text, integer, bigint, uuid, index } from 'drizzle-orm/pg-core';
import type { IngestStatus, SourceFileUploadStatus } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { planSets } from './plan-sets';

/**
 * SourceFile — one uploaded file inside a plan set (spec §5.2). The row is created at
 * upload-URL time (upload_status AWAITING_UPLOAD) and only flips to UPLOADED once the API has
 * verified the stored object's size + checksum (P1-01); ingest_status then drives the pipeline.
 * `byte_size` is bigint so large CAD sets can't overflow. `org_id` is the RLS key (P0-07).
 */
export const sourceFiles = pgTable(
  'source_files',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    plan_set_id: uuid('plan_set_id')
      .notNull()
      .references(() => planSets.id),
    original_filename: text('original_filename').notNull(),
    mime_type: text('mime_type').notNull(),
    byte_size: bigint('byte_size', { mode: 'number' }).notNull(),
    checksum_sha256: text('checksum_sha256').notNull(),
    storage_key: text('storage_key').notNull(),
    page_count: integer('page_count'),
    upload_status: text('upload_status')
      .$type<SourceFileUploadStatus>()
      .notNull()
      .default('AWAITING_UPLOAD'),
    ingest_status: text('ingest_status').$type<IngestStatus>().notNull().default('PENDING'),
    error_detail: text('error_detail'),
    ...timestamps,
  },
  (t) => [
    index('source_files_org_idx').on(t.org_id),
    index('source_files_plan_set_idx').on(t.plan_set_id),
  ],
);
