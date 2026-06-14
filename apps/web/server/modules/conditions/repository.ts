import { and, asc, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { conditions, tradeCategories } from '../../data/schema';

export type Condition = typeof conditions.$inferSelect;

/** Conditions data access, org-scoped via RLS (run inside withOrgScope). */
export const conditionsRepo = {
  async insert(tx: OrgScopedTx, values: typeof conditions.$inferInsert): Promise<Condition> {
    const [row] = await tx.insert(conditions).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Condition | undefined> {
    return tx.query.conditions.findFirst({
      where: and(eq(conditions.id, id), isNull(conditions.deleted_at)),
    });
  },

  async listByTakeoff(tx: OrgScopedTx, takeoffId: string): Promise<Condition[]> {
    return tx.query.conditions.findMany({
      where: and(eq(conditions.takeoff_id, takeoffId), isNull(conditions.deleted_at)),
      orderBy: [asc(conditions.created_at)],
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof conditions.$inferInsert>,
  ): Promise<Condition | undefined> {
    const [row] = await tx
      .update(conditions)
      .set({ ...patch, updated_at: new Date() })
      .where(and(eq(conditions.id, id), isNull(conditions.deleted_at)))
      .returning();
    return row;
  },

  async softDelete(tx: OrgScopedTx, id: string): Promise<number> {
    const now = new Date();
    const rows = await tx
      .update(conditions)
      .set({ deleted_at: now, updated_at: now })
      .where(and(eq(conditions.id, id), isNull(conditions.deleted_at)))
      .returning({ id: conditions.id });
    return rows.length;
  },

  /** Whether a trade category is visible in the current org scope (global or own). */
  async tradeCategoryExists(tx: OrgScopedTx, id: string): Promise<boolean> {
    const row = await tx.query.tradeCategories.findFirst({ where: eq(tradeCategories.id, id) });
    return row !== undefined;
  },
};
