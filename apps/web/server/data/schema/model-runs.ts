import { integer, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ModelRunStatus, ModelRunTrigger } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { planSets } from './plan-sets';

/**
 * ModelRun — one execution of the AI pipeline over a plan set (or a single sheet on a re-run),
 * spec §5.4. Records full version lineage (`pipeline_version` + `model_versions`) for
 * reproducibility, and tolerates partial failure (`status` PARTIAL with `error_detail`). Candidate
 * measurements link back via `measurements.model_run_id`. `org_id` is the RLS key (P0-07).
 */
export const modelRuns = pgTable(
  'model_runs',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    plan_set_id: uuid('plan_set_id')
      .notNull()
      .references(() => planSets.id),
    /** Set for a single-sheet re-run; null for a whole-plan-set run. */
    sheet_id: uuid('sheet_id'),
    pipeline_version: text('pipeline_version').notNull(),
    /** Map of model name → pinned version used this run. */
    model_versions: jsonb('model_versions').$type<Record<string, string>>().notNull().default({}),
    trigger: text('trigger').$type<ModelRunTrigger>().notNull(),
    status: text('status').$type<ModelRunStatus>().notNull().default('QUEUED'),
    candidate_count: integer('candidate_count').notNull().default(0),
    error_detail: text('error_detail'),
    started_at: timestamp('started_at', { withTimezone: true }),
    finished_at: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('model_runs_org_idx').on(t.org_id),
    index('model_runs_plan_set_idx').on(t.plan_set_id),
  ],
);
