import { and, count, eq, isNull } from 'drizzle-orm';
import type { UsageMetric } from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { usageRecords } from '../../data/schema';

export type UsageRecord = typeof usageRecords.$inferSelect;

/** Usage records are org-scoped (RLS). Written inside the billable action's transaction. */
export const usageRecordsRepo = {
  /**
   * Record a billable event exactly once. The unique (metric, reference_id) means a re-run of the
   * same action is a no-op. Returns the inserted row, or undefined if it was already recorded.
   */
  async record(
    tx: OrgScopedTx,
    values: typeof usageRecords.$inferInsert,
  ): Promise<UsageRecord | undefined> {
    const [row] = await tx
      .insert(usageRecords)
      .values(values)
      .onConflictDoNothing({ target: [usageRecords.metric, usageRecords.reference_id] })
      .returning();
    return row;
  },

  /** Count metered events for an org + metric in a billing period (the quota numerator). */
  async countForPeriod(
    tx: OrgScopedTx,
    orgId: string,
    metric: UsageMetric,
    period: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.org_id, orgId),
          eq(usageRecords.metric, metric),
          eq(usageRecords.period, period),
          isNull(usageRecords.deleted_at),
        ),
      );
    return Number(row?.n ?? 0);
  },
};
