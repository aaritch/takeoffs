import { desc } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { drDrillRuns } from '../../data/schema';

export type DrDrillRun = typeof drDrillRuns.$inferSelect;

/** DR drill history — platform-global (no org_id); read/written on the admin connection. */
export const drDrillRunsRepo = {
  async insert(tx: OrgScopedTx, values: typeof drDrillRuns.$inferInsert): Promise<DrDrillRun> {
    const [row] = await tx.insert(drDrillRuns).values(values).returning();
    return row!;
  },

  async listRecent(tx: OrgScopedTx, limit = 50): Promise<DrDrillRun[]> {
    return tx.query.drDrillRuns.findMany({
      orderBy: [desc(drDrillRuns.created_at)],
      limit,
    });
  },
};
