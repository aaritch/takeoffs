import { desc, eq, sql } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { retainerLedgerEntries } from '../../data/schema';

export type RetainerLedgerEntry = typeof retainerLedgerEntries.$inferSelect;

/** The append-only retainer ledger (P4-03). Entries are inserted, listed, and summed — never updated. */
export const retainerLedgerRepo = {
  async append(
    tx: OrgScopedTx,
    values: typeof retainerLedgerEntries.$inferInsert,
  ): Promise<RetainerLedgerEntry> {
    const [row] = await tx.insert(retainerLedgerEntries).values(values).returning();
    return row!;
  },

  /** An org's ledger, newest first. */
  async listByOrg(tx: OrgScopedTx, orgId: string): Promise<RetainerLedgerEntry[]> {
    return tx.query.retainerLedgerEntries.findMany({
      where: eq(retainerLedgerEntries.org_id, orgId),
      orderBy: [desc(retainerLedgerEntries.created_at), desc(retainerLedgerEntries.id)],
    });
  },

  /** The sum of all entries for an org — the balance the ledger reconciles to. */
  async sumForOrg(tx: OrgScopedTx, orgId: string): Promise<number> {
    const [row] = await tx
      .select({
        total: sql<number>`coalesce(sum(${retainerLedgerEntries.amount_minor}), 0)::bigint`,
      })
      .from(retainerLedgerEntries)
      .where(eq(retainerLedgerEntries.org_id, orgId));
    return Number(row?.total ?? 0);
  },
};
