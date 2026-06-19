import { pgTable, text, integer, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PlanSetProcessingStatus } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { projects } from './projects';

/**
 * PlanSet — one uploaded version of a project's drawings (spec §5.2). Holds many SourceFiles;
 * a new upload creates a new version. `org_id` is the RLS key (P0-07); it's denormalized onto
 * every customer-owned table so isolation is uniform and fail-closed.
 */
export const planSets = pgTable(
  'plan_sets',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    version_number: integer('version_number').notNull().default(1),
    label: text('label'),
    source_file_count: integer('source_file_count').notNull().default(0),
    total_sheet_count: integer('total_sheet_count').notNull().default(0),
    processing_status: text('processing_status')
      .$type<PlanSetProcessingStatus>()
      .notNull()
      .default('UPLOADING'),
    uploaded_by_user_id: uuid('uploaded_by_user_id'),
    ...timestamps,
  },
  (t) => [
    index('plan_sets_org_idx').on(t.org_id),
    uniqueIndex('plan_sets_project_version_idx').on(t.project_id, t.version_number),
  ],
);
