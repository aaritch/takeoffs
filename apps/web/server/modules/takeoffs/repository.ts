import { and, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { takeoffs } from '../../data/schema';

export type Takeoff = typeof takeoffs.$inferSelect;

/** Minimal takeoff data access (org-scoped via RLS). Full lifecycle lands in a later task. */
export const takeoffsRepo = {
  async insert(tx: OrgScopedTx, values: typeof takeoffs.$inferInsert): Promise<Takeoff> {
    const [row] = await tx.insert(takeoffs).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Takeoff | undefined> {
    return tx.query.takeoffs.findFirst({
      where: and(eq(takeoffs.id, id), isNull(takeoffs.deleted_at)),
    });
  },
};
