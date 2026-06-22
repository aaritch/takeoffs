import { and, desc, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { modelRuns } from '../../data/schema';

export type ModelRun = typeof modelRuns.$inferSelect;

/** ModelRun data access, org-scoped via RLS (run inside withOrgScope). */
export const modelRunsRepo = {
  async insert(tx: OrgScopedTx, values: typeof modelRuns.$inferInsert): Promise<ModelRun> {
    const [row] = await tx.insert(modelRuns).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<ModelRun | undefined> {
    return tx.query.modelRuns.findFirst({
      where: and(eq(modelRuns.id, id), isNull(modelRuns.deleted_at)),
    });
  },

  async listByPlanSet(tx: OrgScopedTx, planSetId: string): Promise<ModelRun[]> {
    return tx.query.modelRuns.findMany({
      where: and(eq(modelRuns.plan_set_id, planSetId), isNull(modelRuns.deleted_at)),
      orderBy: [desc(modelRuns.created_at)],
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof modelRuns.$inferInsert>,
  ): Promise<ModelRun | undefined> {
    const [row] = await tx
      .update(modelRuns)
      .set({ ...patch, updated_at: new Date() })
      .where(and(eq(modelRuns.id, id), isNull(modelRuns.deleted_at)))
      .returning();
    return row;
  },
};
