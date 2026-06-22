import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { CustomerRole, FeedbackAction, MeasurementGeometry } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { measurements } from './measurements';

/**
 * DetectionFeedback — every human review of an AI candidate, captured as the training signal for
 * the flywheel (spec §5.4 / §7.6, P2-11 GATE). One row per review action with full provenance:
 * the action, before/after geometry (for edits), from/to class (for reclassify), the originating
 * model run (→ model versions), and the actor + role. Capture is first-class, never lossy — a
 * missing row starves the flywheel. `org_id` is the RLS key (P0-07); the org training opt-out is
 * applied at assembly time (Phase 4), not by dropping rows here.
 */
export const detectionFeedback = pgTable(
  'detection_feedback',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    measurement_id: uuid('measurement_id')
      .notNull()
      .references(() => measurements.id),
    /** The run whose candidate this feedback is about (→ pipeline/model versions); null for ADD_MISSED. */
    model_run_id: uuid('model_run_id'),
    action: text('action').$type<FeedbackAction>().notNull(),
    before_geometry: jsonb('before_geometry').$type<MeasurementGeometry>(),
    after_geometry: jsonb('after_geometry').$type<MeasurementGeometry>(),
    from_class: text('from_class'),
    to_class: text('to_class'),
    actor_user_id: uuid('actor_user_id'),
    actor_role: text('actor_role').$type<CustomerRole>(),
    ...timestamps,
  },
  (t) => [
    index('detection_feedback_org_idx').on(t.org_id),
    index('detection_feedback_measurement_idx').on(t.measurement_id),
    index('detection_feedback_model_run_idx').on(t.model_run_id),
  ],
);
