import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { PayoutStatus } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { serviceProfiles } from './accounts';
import { orders } from './orders';

/**
 * PayoutRecord (spec §5.6, §11.5, P4-04) — an estimator's earnings for ONE fulfilled order. Created
 * only when the order is ACCEPTED (or auto-accepted), then settled through the provider's transfer
 * mechanism; disputes never reach ACCEPTED, so they never pay out (the gate).
 *
 * Platform↔estimator financial data — NOT customer-owned, so it has NO `org_id` (and is correctly
 * exempt from the org-RLS guard, like billing_events); access is via the platform/admin connection
 * only. `order_id` is unique → at most one payout per order (exactly-once). Status PENDING → PAID, or
 * → REVERSED; the timestamps + provider refs make the progression auditable. Money is integer minor
 * units with an ISO-4217 code.
 */
export const payoutRecords = pgTable(
  'payout_records',
  {
    id: primaryId(),
    service_profile_id: uuid('service_profile_id')
      .notNull()
      .references(() => serviceProfiles.id),
    order_id: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    amount_minor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').$type<PayoutStatus>().notNull().default('PENDING'),
    provider_transfer_ref: text('provider_transfer_ref'),
    provider_reversal_ref: text('provider_reversal_ref'),
    reversal_reason: text('reversal_reason'),
    settled_at: timestamp('settled_at', { withTimezone: true }),
    reversed_at: timestamp('reversed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('payout_records_order_unique').on(t.order_id),
    index('payout_records_profile_idx').on(t.service_profile_id),
  ],
);
