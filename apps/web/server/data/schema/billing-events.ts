import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { BillingEventType } from '@takeoff/contracts';
import { primaryId } from './columns';

/**
 * Billing-event idempotency ledger (P4-01). The provider may deliver the same webhook more than
 * once; we record each `provider_event_id` exactly once (unique) and skip any we've already seen.
 * Platform-global infrastructure (NO `org_id`) — it tracks provider events, not customer-owned data,
 * so it is correctly exempt from the org-RLS guard (like `pricing_rules`). Append-only.
 */
export const billingEvents = pgTable(
  'billing_events',
  {
    id: primaryId(),
    provider_event_id: text('provider_event_id').notNull(),
    event_type: text('event_type').$type<BillingEventType>().notNull(),
    subscription_ref: text('subscription_ref'),
    org_ref: uuid('org_ref'),
    occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull(),
    processed_at: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('billing_events_provider_event_unique').on(t.provider_event_id)],
);
