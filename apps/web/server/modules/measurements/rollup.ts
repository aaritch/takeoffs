import { and, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { conditions, quantityRollups } from '../../data/schema';
import { computeConditionQuantities } from '../conditions/quantities';
import { measurementsRepo } from './repository';
import { NotFound } from './errors';

export type QuantityRollup = typeof quantityRollups.$inferSelect;

/**
 * Recompute and persist the rollup for a condition from its AUTHORITATIVE measurement set. Called
 * after every measurement change. The total is derived purely from stored geometry-based
 * raw_values + the condition's factors — never from any client-supplied number.
 */
export async function recomputeRollup(
  tx: OrgScopedTx,
  conditionId: string,
): Promise<QuantityRollup> {
  const condition = await tx.query.conditions.findFirst({
    where: and(eq(conditions.id, conditionId), isNull(conditions.deleted_at)),
  });
  if (!condition) {
    throw NotFound('Condition not found');
  }

  const { sum, count } = await measurementsRepo.aggregateForCondition(tx, conditionId);
  const q = computeConditionQuantities(
    {
      measurement_type: condition.measurement_type,
      unit: condition.unit,
      depth_or_height: condition.depth_or_height,
      waste_factor_pct: condition.waste_factor_pct,
      unit_cost_minor: condition.unit_cost_minor,
    },
    sum,
  );

  const now = new Date();
  const values = {
    org_id: condition.org_id,
    condition_id: conditionId,
    base_quantity: q.baseQuantity,
    quantity_with_waste: q.quantityWithWaste,
    derived_volume: q.derivedVolumeCuFt,
    derived_surface_area: q.derivedSurfaceSqFt,
    extended_cost_minor: q.extendedCostMinor,
    measurement_count: count,
    last_computed_at: now,
  };

  const [row] = await tx
    .insert(quantityRollups)
    .values(values)
    .onConflictDoUpdate({
      target: quantityRollups.condition_id,
      set: { ...values, updated_at: now },
    })
    .returning();
  return row!;
}

export async function getRollup(
  tx: OrgScopedTx,
  conditionId: string,
): Promise<QuantityRollup | undefined> {
  return tx.query.quantityRollups.findFirst({
    where: eq(quantityRollups.condition_id, conditionId),
  });
}
