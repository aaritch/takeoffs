import { asc } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { conditionTemplates, tradeCategories } from '../../data/schema';

export type TradeCategory = typeof tradeCategories.$inferSelect;
export type ConditionTemplate = typeof conditionTemplates.$inferSelect;

/**
 * Trade catalog reads, run inside withOrgScope. RLS returns the global seed (org_id NULL) plus
 * the caller org's own customizations; other orgs' customizations are never visible.
 */
export const tradesRepo = {
  async listCategories(tx: OrgScopedTx): Promise<TradeCategory[]> {
    return tx.query.tradeCategories.findMany({ orderBy: [asc(tradeCategories.sort_order)] });
  },

  async listConditionTemplates(tx: OrgScopedTx): Promise<ConditionTemplate[]> {
    return tx.query.conditionTemplates.findMany();
  },

  /** Insert an org-specific (customized) trade category. WITH CHECK enforces org_id = scope. */
  async insertCategory(
    tx: OrgScopedTx,
    values: typeof tradeCategories.$inferInsert,
  ): Promise<TradeCategory> {
    const [row] = await tx.insert(tradeCategories).values(values).returning();
    return row!;
  },
};
