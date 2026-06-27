import { and, eq, gte, sql } from 'drizzle-orm';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { retainers } from '../../data/schema';

export type Retainer = typeof retainers.$inferSelect;

/**
 * Retainer balance access (P3-03 stub). The full retainer lifecycle is Phase 4 (P4-03); here we
 * only need to read a balance and draw against it at placement.
 */
export const retainersRepo = {
  async getByOrg(tx: OrgScopedTx, orgId: string): Promise<Retainer | undefined> {
    return tx.query.retainers.findFirst({ where: eq(retainers.org_id, orgId) });
  },

  /** Set (insert or update) an org's retainer balance — placeholder for the Phase-4 top-up flow. */
  async upsertBalance(tx: OrgScopedTx, balanceMinor: number): Promise<Retainer> {
    const orgId = await currentOrgId(tx);
    const [row] = await tx
      .insert(retainers)
      .values({ org_id: orgId, balance_minor: balanceMinor })
      .onConflictDoUpdate({
        target: retainers.org_id,
        set: { balance_minor: balanceMinor, updated_at: new Date() },
      })
      .returning();
    return row!;
  },

  /**
   * Atomically draw `amountMinor` from the org's retainer if (and only if) the balance covers it.
   * Returns the new balance, or null when there's no retainer / insufficient funds (no change made).
   */
  async draw(tx: OrgScopedTx, orgId: string, amountMinor: number): Promise<number | null> {
    const [row] = await tx
      .update(retainers)
      .set({
        balance_minor: sql`${retainers.balance_minor} - ${amountMinor}`,
        updated_at: new Date(),
      })
      .where(and(eq(retainers.org_id, orgId), gte(retainers.balance_minor, amountMinor)))
      .returning({ balance_minor: retainers.balance_minor });
    return row ? row.balance_minor : null;
  },
};
