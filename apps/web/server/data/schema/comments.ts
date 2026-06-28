import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { takeoffs } from './takeoffs';
import { measurements } from './measurements';

/**
 * Comment (spec §13, P5-04) — a durable note on a takeoff, optionally ANCHORED to a measurement. The
 * anchor is the measurement's stable `id`, so a comment survives geometry edits (editing a
 * measurement updates the row in place — same id — and the comment stays attached). Threaded via
 * `parent_comment_id`. `org_id` is the RLS key; this is the source of truth a client re-loads on
 * reconnect (live presence/edit deltas are ephemeral and non-authoritative).
 */
export const comments = pgTable(
  'comments',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    takeoff_id: uuid('takeoff_id')
      .notNull()
      .references(() => takeoffs.id),
    /** The anchor — null for a takeoff-level comment. */
    measurement_id: uuid('measurement_id').references(() => measurements.id),
    sheet_id: uuid('sheet_id'),
    parent_comment_id: uuid('parent_comment_id'),
    author_user_id: uuid('author_user_id').notNull(),
    body: text('body').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    resolved_by_user_id: uuid('resolved_by_user_id'),
    ...timestamps,
  },
  (t) => [
    index('comments_takeoff_idx').on(t.takeoff_id),
    index('comments_measurement_idx').on(t.measurement_id),
  ],
);
