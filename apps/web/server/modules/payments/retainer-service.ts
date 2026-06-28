import type { OrgScopedTx } from '../../data/org-scope';
import { ValidationFailed } from '../source-files/errors';
import { retainerLedgerRepo, type RetainerLedgerEntry } from './ledger';
import { retainersRepo, type Retainer } from './retainers';

export interface TopUpOptions {
  /** A payment reference (e.g. a Stripe PaymentIntent id) for the secured deposit. */
  paymentReference?: string;
  description?: string;
}

export interface DrawOptions {
  /** The managed order this draw pays for. */
  orderId?: string;
  description?: string;
}

/**
 * Retainer lifecycle (spec §11.5, P4-03) — the prepaid managed-service balance and its draw-down,
 * replacing the Phase-3 stub. Every balance change goes through here and writes BOTH the atomic
 * balance update AND an append-only ledger entry in the SAME transaction, so the ledger always
 * reconciles to the balance and a balance is never mutated without a corresponding entry (the caveat).
 */
export const retainerService = {
  /**
   * Credit the retainer (a deposit). The payment is secured by the caller before this records the
   * credit; here we add to the balance and append a TOP_UP entry atomically.
   */
  async topUp(
    tx: OrgScopedTx,
    orgId: string,
    amountMinor: number,
    opts: TopUpOptions = {},
  ): Promise<{ retainer: Retainer; entry: RetainerLedgerEntry }> {
    if (!(amountMinor > 0)) {
      throw ValidationFailed('Top-up amount must be positive', { field: 'amountMinor' });
    }
    const retainer = await retainersRepo.ensure(tx, orgId);
    const balanceAfter = await retainersRepo.increment(tx, retainer.id, amountMinor);
    const entry = await retainerLedgerRepo.append(tx, {
      org_id: orgId,
      retainer_id: retainer.id,
      entry_type: 'TOP_UP',
      amount_minor: amountMinor,
      balance_after_minor: balanceAfter,
      reference_type: opts.paymentReference ? 'PAYMENT' : null,
      reference_id: opts.paymentReference ?? null,
      description: opts.description ?? null,
    });
    return { retainer: { ...retainer, balance_minor: balanceAfter }, entry };
  },

  /**
   * Draw `amountMinor` against the retainer for a managed order. Returns the new balance, or null when
   * there's no retainer / insufficient funds (no change, no ledger entry) — the caller then requests a
   * top-up. On success, the debit and its DRAW ledger entry commit together with the order placement.
   */
  async draw(
    tx: OrgScopedTx,
    orgId: string,
    amountMinor: number,
    opts: DrawOptions = {},
  ): Promise<number | null> {
    const retainer = await retainersRepo.getByOrg(tx, orgId);
    if (!retainer) return null;
    const balanceAfter = await retainersRepo.drawIfSufficient(tx, retainer.id, amountMinor);
    if (balanceAfter === null) return null;
    await retainerLedgerRepo.append(tx, {
      org_id: orgId,
      retainer_id: retainer.id,
      entry_type: 'DRAW',
      amount_minor: -amountMinor,
      balance_after_minor: balanceAfter,
      reference_type: opts.orderId ? 'ORDER' : null,
      reference_id: opts.orderId ?? null,
      description: opts.description ?? null,
    });
    return balanceAfter;
  },

  getByOrg(tx: OrgScopedTx, orgId: string): Promise<Retainer | undefined> {
    return retainersRepo.getByOrg(tx, orgId);
  },

  ledger(tx: OrgScopedTx, orgId: string): Promise<RetainerLedgerEntry[]> {
    return retainerLedgerRepo.listByOrg(tx, orgId);
  },

  /** The balance computed straight from the ledger — used to assert reconciliation. */
  balanceFromLedger(tx: OrgScopedTx, orgId: string): Promise<number> {
    return retainerLedgerRepo.sumForOrg(tx, orgId);
  },
};
