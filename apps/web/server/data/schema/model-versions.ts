import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { ModelVersionStatus } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';

/**
 * Model version registry (spec §7.4, P4-06) — the promotable/servable versions per model family
 * (classify, scale, line_seg, symbol, …). Platform-global ML asset — NOT customer-owned, so no
 * `org_id` (correctly exempt from the org-RLS guard, like billing_events); the inference plane reads
 * the ACTIVE version to serve, the app records it on every ModelRun, and P4-05's eval writes the
 * `metrics` (per-class/per-metric against the frozen benchmark) that the promotion gate checks.
 *
 * `previous_active_id` records which version this one superseded when promoted, so a rollback is a
 * single version switch back — not a redeploy. One ACTIVE row per family.
 */
export const modelVersions = pgTable(
  'model_versions',
  {
    id: primaryId(),
    model_family: text('model_family').notNull(),
    version: text('version').notNull(),
    status: text('status').$type<ModelVersionStatus>().notNull().default('CANDIDATE'),
    /** Per-metric (and per-class, via `class.metric` keys) scores vs the frozen benchmark. */
    metrics: jsonb('metrics').$type<Record<string, number>>().notNull().default({}),
    /** The frozen benchmark set the metrics were measured against (must never leak into training). */
    benchmark_id: text('benchmark_id'),
    previous_active_id: uuid('previous_active_id'),
    activated_at: timestamp('activated_at', { withTimezone: true }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('model_versions_family_version_unique').on(t.model_family, t.version),
    // At most one ACTIVE (served) version per family.
    uniqueIndex('model_versions_one_active_per_family')
      .on(t.model_family)
      .where(sql`${t.status} = 'ACTIVE' and ${t.deleted_at} is null`),
  ],
);
