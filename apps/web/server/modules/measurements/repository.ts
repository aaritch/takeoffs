import { and, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { measurements } from '../../data/schema';

export type Measurement = typeof measurements.$inferSelect;

/** Review states whose measurements count toward a rollup (manual ones default ACCEPTED). */
const COUNTED_STATES = ['ACCEPTED', 'EDITED'] as const;

export const measurementsRepo = {
  async insert(tx: OrgScopedTx, values: typeof measurements.$inferInsert): Promise<Measurement> {
    const [row] = await tx.insert(measurements).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Measurement | undefined> {
    return tx.query.measurements.findFirst({
      where: and(eq(measurements.id, id), isNull(measurements.deleted_at)),
    });
  },

  /** Find a measurement regardless of soft-delete state — used to restore on undo (P1-12). */
  async getByIdWithDeleted(tx: OrgScopedTx, id: string): Promise<Measurement | undefined> {
    return tx.query.measurements.findFirst({ where: eq(measurements.id, id) });
  },

  /** Clear a soft-delete, bringing the row (and its quantity) back. Returns the live row. */
  async restore(tx: OrgScopedTx, id: string): Promise<Measurement | undefined> {
    const [row] = await tx
      .update(measurements)
      .set({ deleted_at: null, updated_at: new Date() })
      .where(eq(measurements.id, id))
      .returning();
    return row;
  },

  /** All live measurements on a sheet, for the viewer overlay (P1-07/P1-09). */
  async listBySheet(tx: OrgScopedTx, sheetId: string): Promise<Measurement[]> {
    return tx.query.measurements.findMany({
      where: and(eq(measurements.sheet_id, sheetId), isNull(measurements.deleted_at)),
    });
  },

  /** Live UNREVIEWED AI candidates in a condition at or above a confidence — for bulk-accept (P2-10). */
  async listUnreviewedAiByCondition(
    tx: OrgScopedTx,
    conditionId: string,
    minConfidence: number,
  ): Promise<Measurement[]> {
    return tx.query.measurements.findMany({
      where: and(
        eq(measurements.condition_id, conditionId),
        eq(measurements.source, 'AI'),
        eq(measurements.review_status, 'UNREVIEWED'),
        gte(measurements.ai_confidence, minConfidence),
        isNull(measurements.deleted_at),
      ),
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof measurements.$inferInsert>,
  ): Promise<Measurement | undefined> {
    const [row] = await tx
      .update(measurements)
      .set({ ...patch, updated_at: new Date() })
      .where(and(eq(measurements.id, id), isNull(measurements.deleted_at)))
      .returning();
    return row;
  },

  /**
   * Soft-delete a sheet's UNREVIEWED AI candidates — the "re-running a sheet replaces its prior
   * candidate set, never duplicates" rule (P2-03). Human-reviewed rows (ACCEPTED/REJECTED/EDITED)
   * are decisions, not candidates, so they are left untouched.
   */
  async softDeleteAiCandidatesForSheet(tx: OrgScopedTx, sheetId: string): Promise<number> {
    const now = new Date();
    const rows = await tx
      .update(measurements)
      .set({ deleted_at: now, updated_at: now })
      .where(
        and(
          eq(measurements.sheet_id, sheetId),
          eq(measurements.source, 'AI'),
          eq(measurements.review_status, 'UNREVIEWED'),
          isNull(measurements.deleted_at),
        ),
      )
      .returning({ id: measurements.id });
    return rows.length;
  },

  async softDelete(tx: OrgScopedTx, id: string): Promise<number> {
    const now = new Date();
    const rows = await tx
      .update(measurements)
      .set({ deleted_at: now, updated_at: now })
      .where(and(eq(measurements.id, id), isNull(measurements.deleted_at)))
      .returning({ id: measurements.id });
    return rows.length;
  },

  /**
   * Efficient authoritative aggregate for a condition: SUM(raw_value) and COUNT of the counted,
   * live measurements — a single query, not a row-by-row load (P1-11 efficiency caveat).
   */
  async aggregateForCondition(
    tx: OrgScopedTx,
    conditionId: string,
  ): Promise<{ sum: number; count: number }> {
    const [row] = await tx
      .select({
        sum: sql<string>`coalesce(sum(${measurements.raw_value}), 0)`,
        cnt: count(),
      })
      .from(measurements)
      .where(
        and(
          eq(measurements.condition_id, conditionId),
          isNull(measurements.deleted_at),
          inArray(measurements.review_status, [...COUNTED_STATES]),
        ),
      );
    return { sum: Number(row?.sum ?? 0), count: Number(row?.cnt ?? 0) };
  },
};
