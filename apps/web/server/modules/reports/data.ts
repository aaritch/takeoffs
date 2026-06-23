import type { OrgScopedTx } from '../../data/org-scope';
import { computeConditionQuantities } from '../conditions/quantities';
import { conditionsRepo } from '../conditions/repository';
import { measurementsRepo } from '../measurements';
import { takeoffsRepo } from '../takeoffs/repository';
import { NotFound } from '../source-files/errors';
import type { ReportConditionRow, ReportData } from './render';

/**
 * Assemble a FINAL report's rows from the authoritative state (P1-13), with the scale gate applied
 * (P2-05): each condition's quantity is recomputed from the geometry-derived raw_values of its
 * measurements on CONFIRMED-scale sheets only — measurements on unconfirmed-scale sheets are
 * provisional and excluded. Numbers still come purely from stored geometry + condition factors
 * (never a client value), so the export remains server-authoritative and parity-checkable (P1-14).
 * The excluded sheets are returned so the omission is surfaced, never silent.
 */
export async function buildReportData(tx: OrgScopedTx, takeoffId: string): Promise<ReportData> {
  const takeoff = await takeoffsRepo.getById(tx, takeoffId);
  if (!takeoff) throw NotFound('Takeoff not found');

  // Trade categories visible in this org scope (globals + own) → lookup for names/divisions.
  const trades = await tx.query.tradeCategories.findMany();
  const tradeById = new Map(trades.map((t) => [t.id, t]));

  const conditions = await conditionsRepo.listByTakeoff(tx, takeoffId);
  const rows: ReportConditionRow[] = [];
  for (const condition of conditions) {
    const { sum, count } = await measurementsRepo.aggregateForConditionConfirmedScale(
      tx,
      condition.id,
    );
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
    const trade = tradeById.get(condition.trade_category_id);
    rows.push({
      conditionId: condition.id,
      conditionName: condition.name,
      tradeName: trade?.name ?? 'Uncategorized',
      tradeDivision: trade?.division_code ?? '',
      tradeSortOrder: trade?.sort_order ?? Number.MAX_SAFE_INTEGER,
      measurementType: condition.measurement_type,
      unit: condition.unit,
      baseQuantity: q.baseQuantity,
      quantityWithWaste: q.quantityWithWaste,
      measurementCount: count,
      derivedVolume: q.derivedVolumeCuFt,
      derivedSurfaceArea: q.derivedSurfaceSqFt,
      unitCostMinor: condition.unit_cost_minor ?? null,
      extendedCostMinor: q.extendedCostMinor,
    });
  }

  const excludedSheets = await measurementsRepo.excludedScaleSheets(
    tx,
    conditions.map((c) => c.id),
  );
  return { takeoffId, rows, excludedSheets };
}
