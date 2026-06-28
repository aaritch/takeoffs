import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { RetainerLedgerEntryType } from '@takeoff/contracts';
import { primaryId } from './columns';
import { organizations } from './accounts';
import { retainers } from './retainers';

/**
 * Retainer ledger (spec §11.5, P4-03) — the APPEND-ONLY history behind a retainer balance. Every
 * change to the balance writes one entry; the balance is the running sum of these entries and
 * reconciles to it at all times (the caveat: never mutate a balance without a ledger entry). Entries
 * are immutable (a DB trigger rejects UPDATE/DELETE), so there is no `updated_at`/`deleted_at`.
 *
 * `amount_minor` is SIGNED (TOP_UP/REVERSAL positive, DRAW negative) so SUM(amount_minor) = balance.
 * `balance_after_minor` snapshots the running balance after this entry. `reference_id` points at the
 * originating thing (an order id for a DRAW, a payment reference for a TOP_UP). `org_id` is the RLS key.
 */
export const retainerLedgerEntries = pgTable(
  'retainer_ledger_entries',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    retainer_id: uuid('retainer_id')
      .notNull()
      .references(() => retainers.id),
    entry_type: text('entry_type').$type<RetainerLedgerEntryType>().notNull(),
    amount_minor: bigint('amount_minor', { mode: 'number' }).notNull(),
    balance_after_minor: bigint('balance_after_minor', { mode: 'number' }).notNull(),
    reference_type: text('reference_type'),
    reference_id: text('reference_id'),
    description: text('description'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('retainer_ledger_org_idx').on(t.org_id),
    index('retainer_ledger_retainer_idx').on(t.retainer_id),
  ],
);
