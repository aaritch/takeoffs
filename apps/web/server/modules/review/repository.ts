import { and, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { detectionFeedback } from '../../data/schema';

export type DetectionFeedback = typeof detectionFeedback.$inferSelect;

/** DetectionFeedback data access, org-scoped via RLS (run inside withOrgScope). */
export const detectionFeedbackRepo = {
  async insert(
    tx: OrgScopedTx,
    values: typeof detectionFeedback.$inferInsert,
  ): Promise<DetectionFeedback> {
    const [row] = await tx.insert(detectionFeedback).values(values).returning();
    return row!;
  },

  async listByMeasurement(tx: OrgScopedTx, measurementId: string): Promise<DetectionFeedback[]> {
    return tx.query.detectionFeedback.findMany({
      where: and(
        eq(detectionFeedback.measurement_id, measurementId),
        isNull(detectionFeedback.deleted_at),
      ),
    });
  },
};
