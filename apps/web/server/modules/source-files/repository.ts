import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { planSets, sourceFiles } from '../../data/schema';

export type PlanSet = typeof planSets.$inferSelect;
export type SourceFile = typeof sourceFiles.$inferSelect;

/** Plan-set data access, org-scoped via RLS (run inside withOrgScope). */
export const planSetsRepo = {
  async insert(tx: OrgScopedTx, values: typeof planSets.$inferInsert): Promise<PlanSet> {
    const [row] = await tx.insert(planSets).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<PlanSet | undefined> {
    return tx.query.planSets.findFirst({
      where: and(eq(planSets.id, id), isNull(planSets.deleted_at)),
    });
  },

  /** The next version number for a project (1 for the first plan set). Scoped, so cross-org rows are invisible. */
  async nextVersionNumber(tx: OrgScopedTx, projectId: string): Promise<number> {
    const rows = await tx
      .select({ max: sql<number>`coalesce(max(${planSets.version_number}), 0)` })
      .from(planSets)
      .where(eq(planSets.project_id, projectId));
    return (rows[0]?.max ?? 0) + 1;
  },

  async addToSourceFileCount(tx: OrgScopedTx, id: string, by: number): Promise<void> {
    await tx
      .update(planSets)
      .set({
        source_file_count: sql`${planSets.source_file_count} + ${by}`,
        updated_at: new Date(),
      })
      .where(eq(planSets.id, id));
  },
};

/** Source-file data access, org-scoped via RLS. */
export const sourceFilesRepo = {
  async insert(tx: OrgScopedTx, values: typeof sourceFiles.$inferInsert): Promise<SourceFile> {
    const [row] = await tx.insert(sourceFiles).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<SourceFile | undefined> {
    return tx.query.sourceFiles.findFirst({
      where: and(eq(sourceFiles.id, id), isNull(sourceFiles.deleted_at)),
    });
  },

  async listByPlanSet(tx: OrgScopedTx, planSetId: string): Promise<SourceFile[]> {
    return tx.query.sourceFiles.findMany({
      where: and(eq(sourceFiles.plan_set_id, planSetId), isNull(sourceFiles.deleted_at)),
      orderBy: [asc(sourceFiles.created_at)],
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof sourceFiles.$inferInsert>,
  ): Promise<SourceFile | undefined> {
    const [row] = await tx
      .update(sourceFiles)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(sourceFiles.id, id))
      .returning();
    return row;
  },
};
