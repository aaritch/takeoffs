import { and, asc, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { comments } from '../../data/schema';

export type Comment = typeof comments.$inferSelect;

/** Comments data access — org-scoped (RLS). */
export const commentsRepo = {
  async insert(tx: OrgScopedTx, values: typeof comments.$inferInsert): Promise<Comment> {
    const [row] = await tx.insert(comments).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Comment | undefined> {
    return tx.query.comments.findFirst({
      where: and(eq(comments.id, id), isNull(comments.deleted_at)),
    });
  },

  async listByTakeoff(tx: OrgScopedTx, takeoffId: string): Promise<Comment[]> {
    return tx.query.comments.findMany({
      where: and(eq(comments.takeoff_id, takeoffId), isNull(comments.deleted_at)),
      orderBy: [asc(comments.created_at)],
    });
  },

  async listByMeasurement(tx: OrgScopedTx, measurementId: string): Promise<Comment[]> {
    return tx.query.comments.findMany({
      where: and(eq(comments.measurement_id, measurementId), isNull(comments.deleted_at)),
      orderBy: [asc(comments.created_at)],
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof comments.$inferInsert>,
  ): Promise<Comment | undefined> {
    const [row] = await tx
      .update(comments)
      .set({ ...patch, updated_at: new Date() })
      .where(and(eq(comments.id, id), isNull(comments.deleted_at)))
      .returning();
    return row;
  },

  async softDelete(tx: OrgScopedTx, id: string): Promise<void> {
    await tx
      .update(comments)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(eq(comments.id, id));
  },
};
