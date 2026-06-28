import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { PlanTier, SubscriptionStatus } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';

/**
 * Subscription (spec §5.6) — an org's plan, reconciled from the payment provider's webhooks, which
 * are the SOURCE OF TRUTH (P4-01). We never treat a local write as authoritative for billing state.
 * `org_id` is the RLS key. One live subscription per org. `last_event_at` is the provider timestamp
 * of the most recently APPLIED event, so an out-of-order / retried webhook can't overwrite newer
 * state. Enum columns are `text` + `$type` (validated at the boundary), matching the rest of §5.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    provider_customer_ref: text('provider_customer_ref'),
    provider_subscription_ref: text('provider_subscription_ref').notNull(),
    status: text('status').$type<SubscriptionStatus>().notNull(),
    plan_tier: text('plan_tier').$type<PlanTier>().notNull(),
    seat_limit: integer('seat_limit').notNull(),
    current_period_end: timestamp('current_period_end', { withTimezone: true }),
    cancel_at_period_end: boolean('cancel_at_period_end').notNull().default(false),
    /** Provider timestamp of the last applied event — guards against out-of-order delivery. */
    last_event_at: timestamp('last_event_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('subscriptions_provider_ref_unique').on(t.provider_subscription_ref),
    // One live subscription per org (a soft-deleted row doesn't block a new one).
    uniqueIndex('subscriptions_org_unique')
      .on(t.org_id)
      .where(sql`${t.deleted_at} is null`),
  ],
);
