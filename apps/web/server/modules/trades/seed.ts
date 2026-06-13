import { and, eq, isNull } from 'drizzle-orm';
import type { DB } from '../../data/client';
import { conditionTemplates, tradeCategories } from '../../data/schema';
import { SEED_TRADES } from './seed-data';

/**
 * Load the global seed trade structure and starter condition library (org_id NULL). Idempotent:
 * existing global rows are matched by their natural keys and left untouched, so it is safe to run
 * on every deploy. MUST run via the admin/identity connection (the non-superuser tenant role
 * cannot write global rows — RLS WITH CHECK forbids it).
 */
export async function seedGlobalTradeData(db: DB): Promise<void> {
  for (const trade of SEED_TRADES) {
    let category = await db.query.tradeCategories.findFirst({
      where: and(
        isNull(tradeCategories.org_id),
        eq(tradeCategories.division_code, trade.division_code),
      ),
    });

    if (!category) {
      const [inserted] = await db
        .insert(tradeCategories)
        .values({
          name: trade.name,
          division_code: trade.division_code,
          sort_order: trade.sort_order,
        })
        .returning();
      category = inserted!;
    }

    for (const condition of trade.conditions) {
      const existing = await db.query.conditionTemplates.findFirst({
        where: and(
          isNull(conditionTemplates.org_id),
          eq(conditionTemplates.trade_category_id, category.id),
          eq(conditionTemplates.name, condition.name),
        ),
      });
      if (!existing) {
        await db.insert(conditionTemplates).values({
          trade_category_id: category.id,
          name: condition.name,
          measurement_type: condition.measurement_type,
          unit: condition.unit,
          color_hex: condition.color_hex,
        });
      }
    }
  }
}
