import { and, eq, gte, sql } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { retainers } from '../../data/schema';

export type Retainer = typeof retainers.$inferSelect;

/**
 * Low-level retainer balance access (P4-03). The cached `balance_minor` is only ever changed through
 * these atomic primitives, and ALWAYS paired with a retainer-ledger entry in the same transaction by
 * {@link retainerService} — never mutated in place on its own (the caveat).
 */
export const retainersRepo = {
  async getByOrg(tx: OrgScopedTx, orgId: string): Promise<Retainer | undefined> {
    return tx.query.retainers.findFirst({ where: eq(retainers.org_id, orgId) });
  },

  /** Get the org's retainer, creating it at zero balance if it doesn't exist yet. */
  async ensure(tx: OrgScopedTx, orgId: string): Promise<Retainer> {
    const existing = await this.getByOrg(tx, orgId);
    if (existing) return existing;
    const [row] = await tx
      .insert(retainers)
      .values({ org_id: orgId, balance_minor: 0 })
      .onConflictDoNothing({ target: retainers.org_id })
      .returning();
    return row ?? (await this.getByOrg(tx, orgId))!;
  },

  /** Atomically add to the balance (a credit). Returns the new balance. */
  async increment(tx: OrgScopedTx, retainerId: string, amountMinor: number): Promise<number> {
    const [row] = await tx
      .update(retainers)
      .set({
        balance_minor: sql`${retainers.balance_minor} + ${amountMinor}`,
        updated_at: new Date(),
      })
      .where(eq(retainers.id, retainerId))
      .returning({ balance_minor: retainers.balance_minor });
    return row!.balance_minor;
  },

  /**
   * Atomically draw `amountMinor` if (and only if) the balance covers it. Returns the new balance, or
   * null when there are insufficient funds (no change made) — the conditional `balance >= amount`
   * guard makes the check-and-debit a single statement, so concurrent draws can't overdraw.
   */
  async drawIfSufficient(
    tx: OrgScopedTx,
    retainerId: string,
    amountMinor: number,
  ): Promise<number | null> {
    const [row] = await tx
      .update(retainers)
      .set({
        balance_minor: sql`${retainers.balance_minor} - ${amountMinor}`,
        updated_at: new Date(),
      })
      .where(and(eq(retainers.id, retainerId), gte(retainers.balance_minor, amountMinor)))
      .returning({ balance_minor: retainers.balance_minor });
    return row ? row.balance_minor : null;
  },
};
