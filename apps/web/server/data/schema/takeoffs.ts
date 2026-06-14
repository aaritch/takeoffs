import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { TakeoffOrigin, TakeoffStatus } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { projects } from './projects';

/**
 * Takeoff — the working set of measured quantities for a project (spec §5.3). Created minimally
 * here to anchor conditions (P1-10); the full lifecycle (status transitions, binding to a
 * specific plan-set version) lands with the takeoff/plan-set tasks. `plan_set_id` is nullable
 * until plan sets exist (P1-01/02).
 */
export const takeoffs = pgTable(
  'takeoffs',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    plan_set_id: uuid('plan_set_id'),
    status: text('status').$type<TakeoffStatus>().notNull().default('DRAFT'),
    origin: text('origin').$type<TakeoffOrigin>().notNull().default('SELF_SERVE'),
    created_by_user_id: uuid('created_by_user_id'),
    ...timestamps,
  },
  (t) => [index('takeoffs_org_idx').on(t.org_id), index('takeoffs_project_idx').on(t.project_id)],
);
