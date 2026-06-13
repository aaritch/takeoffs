import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Primary key: UUID v7 (time-orderable, spec §5). Generated app-side so ids exist before the
 * insert round-trips (Postgres < 18 has no native uuid v7).
 */
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

/**
 * Columns every entity carries (spec §5): created/updated timestamps in UTC and a nullable
 * soft-delete marker. `deleted_at IS NULL` means "live".
 */
export const timestamps = {
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
};
