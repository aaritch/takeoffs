import { and, desc, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { reports } from '../../data/schema';

export type Report = typeof reports.$inferSelect;

/** Reports data access, org-scoped via RLS (run inside withOrgScope). */
export const reportsRepo = {
  async insert(tx: OrgScopedTx, values: typeof reports.$inferInsert): Promise<Report> {
    const [row] = await tx.insert(reports).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Report | undefined> {
    return tx.query.reports.findFirst({
      where: and(eq(reports.id, id), isNull(reports.deleted_at)),
    });
  },

  async listByTakeoff(tx: OrgScopedTx, takeoffId: string): Promise<Report[]> {
    return tx.query.reports.findMany({
      where: and(eq(reports.takeoff_id, takeoffId), isNull(reports.deleted_at)),
      orderBy: [desc(reports.created_at)],
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof reports.$inferInsert>,
  ): Promise<Report | undefined> {
    const [row] = await tx
      .update(reports)
      .set({ ...patch, updated_at: new Date() })
      .where(and(eq(reports.id, id), isNull(reports.deleted_at)))
      .returning();
    return row;
  },
};
