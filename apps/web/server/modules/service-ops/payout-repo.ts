import { desc, eq } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { payoutRecords } from '../../data/schema';

export type PayoutRecord = typeof payoutRecords.$inferSelect;

/**
 * Payout data access (P4-04). Platform-global (no org_id) — run on the admin/platform connection.
 * `order_id` is unique, so `insertIfAbsent` is the exactly-once gate: a second attempt for the same
 * order returns the existing record rather than creating a duplicate payout.
 */
export const payoutRecordsRepo = {
  async getByOrder(tx: OrgScopedTx, orderId: string): Promise<PayoutRecord | undefined> {
    return tx.query.payoutRecords.findFirst({ where: eq(payoutRecords.order_id, orderId) });
  },

  async getById(tx: OrgScopedTx, id: string): Promise<PayoutRecord | undefined> {
    return tx.query.payoutRecords.findFirst({ where: eq(payoutRecords.id, id) });
  },

  /** Insert a payout, or return the existing one for this order (unique order_id → one per order). */
  async insertIfAbsent(
    tx: OrgScopedTx,
    values: typeof payoutRecords.$inferInsert,
  ): Promise<PayoutRecord> {
    const [row] = await tx
      .insert(payoutRecords)
      .values(values)
      .onConflictDoNothing({ target: payoutRecords.order_id })
      .returning();
    return row ?? (await this.getByOrder(tx, values.order_id))!;
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof payoutRecords.$inferInsert>,
  ): Promise<PayoutRecord> {
    const [row] = await tx
      .update(payoutRecords)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(payoutRecords.id, id))
      .returning();
    return row!;
  },

  async listByEstimator(tx: OrgScopedTx, serviceProfileId: string): Promise<PayoutRecord[]> {
    return tx.query.payoutRecords.findMany({
      where: eq(payoutRecords.service_profile_id, serviceProfileId),
      orderBy: [desc(payoutRecords.created_at)],
    });
  },

  async listAll(tx: OrgScopedTx): Promise<PayoutRecord[]> {
    return tx.query.payoutRecords.findMany({ orderBy: [desc(payoutRecords.created_at)] });
  },
};
