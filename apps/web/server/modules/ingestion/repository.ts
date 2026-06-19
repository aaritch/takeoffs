import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { PlanSetProcessingStatus } from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { planSets, sheets, sourceFiles } from '../../data/schema';

export type Sheet = typeof sheets.$inferSelect;

/** Sheet data access, org-scoped via RLS (run inside withOrgScope). */
export const sheetsRepo = {
  async insertMany(tx: OrgScopedTx, values: (typeof sheets.$inferInsert)[]): Promise<Sheet[]> {
    if (values.length === 0) return [];
    return tx.insert(sheets).values(values).returning();
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Sheet | undefined> {
    return tx.query.sheets.findFirst({ where: and(eq(sheets.id, id), isNull(sheets.deleted_at)) });
  },

  async listBySourceFile(tx: OrgScopedTx, sourceFileId: string): Promise<Sheet[]> {
    return tx.query.sheets.findMany({
      where: and(eq(sheets.source_file_id, sourceFileId), isNull(sheets.deleted_at)),
      orderBy: [asc(sheets.index_in_set)],
    });
  },

  async countBySourceFile(tx: OrgScopedTx, sourceFileId: string): Promise<number> {
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sheets)
      .where(eq(sheets.source_file_id, sourceFileId));
    return rows[0]?.n ?? 0;
  },

  /** Hard-delete a source file's sheets so a re-split is idempotent (no dependents yet at P1-02). */
  async deleteBySourceFile(tx: OrgScopedTx, sourceFileId: string): Promise<void> {
    await tx.delete(sheets).where(eq(sheets.source_file_id, sourceFileId));
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof sheets.$inferInsert>,
  ): Promise<void> {
    await tx
      .update(sheets)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(sheets.id, id));
  },

  /** A plan set's sheets in deterministic order (by source file, then page index). */
  async listByPlanSet(tx: OrgScopedTx, planSetId: string): Promise<Sheet[]> {
    return tx.query.sheets.findMany({
      where: and(eq(sheets.plan_set_id, planSetId), isNull(sheets.deleted_at)),
      orderBy: [asc(sheets.source_file_id), asc(sheets.index_in_set)],
    });
  },
};

/**
 * Recompute a plan set's rolled-up status from its source files (spec §10.4): PARTIAL if any file
 * FAILED, READY once every file is PROCESSED, otherwise still PROCESSING. Also refreshes the
 * cached total sheet count.
 */
export async function recomputePlanSetStatus(tx: OrgScopedTx, planSetId: string): Promise<void> {
  const files = await tx
    .select({ status: sourceFiles.ingest_status })
    .from(sourceFiles)
    .where(and(eq(sourceFiles.plan_set_id, planSetId), isNull(sourceFiles.deleted_at)));
  const statuses = files.map((f) => f.status);

  let processing: PlanSetProcessingStatus = 'PROCESSING';
  if (statuses.some((s) => s === 'FAILED')) processing = 'PARTIAL';
  else if (statuses.length > 0 && statuses.every((s) => s === 'PROCESSED')) processing = 'READY';

  const sheetCount = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(sheets)
    .where(eq(sheets.plan_set_id, planSetId));

  await tx
    .update(planSets)
    .set({
      processing_status: processing,
      total_sheet_count: sheetCount[0]?.n ?? 0,
      updated_at: new Date(),
    })
    .where(eq(planSets.id, planSetId));
}
