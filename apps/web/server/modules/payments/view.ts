import type { RetainerLedgerEntryView, RetainerView } from '@takeoff/contracts';
import type { RetainerLedgerEntry } from './ledger';
import type { Retainer } from './retainers';

/** Platform settlement currency for retainers (single-currency for now; ISO-4217). */
export const RETAINER_CURRENCY = 'USD';

export function retainerToView(r: Retainer): RetainerView {
  return {
    id: r.id,
    orgId: r.org_id,
    balanceMinor: r.balance_minor,
    currency: RETAINER_CURRENCY,
    updatedAt: r.updated_at.toISOString(),
  };
}

export function ledgerEntryToView(e: RetainerLedgerEntry): RetainerLedgerEntryView {
  return {
    id: e.id,
    entryType: e.entry_type,
    amountMinor: e.amount_minor,
    balanceAfterMinor: e.balance_after_minor,
    referenceType: e.reference_type,
    referenceId: e.reference_id,
    description: e.description,
    createdAt: e.created_at.toISOString(),
  };
}
