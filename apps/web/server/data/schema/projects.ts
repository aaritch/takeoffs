import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import type { ProjectStatus, ProjectType } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';

/**
 * Project — a bid/job (spec §5.2). The root customer-owned business entity; `org_id` ties it
 * to a tenant and is the column the org-isolation RLS policy keys on (P0-07). The full project
 * feature lands in Phase 1; this exists now to anchor and prove the isolation gate.
 */
export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    client_name: text('client_name'),
    location_text: text('location_text'),
    project_type: text('project_type').$type<ProjectType>().notNull().default('RESIDENTIAL'),
    bid_due_at: timestamp('bid_due_at', { withTimezone: true }),
    status: text('status').$type<ProjectStatus>().notNull().default('OPEN'),
    created_by_user_id: uuid('created_by_user_id'),
    ...timestamps,
  },
  (t) => [index('projects_org_idx').on(t.org_id)],
);
