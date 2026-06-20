import type { OrgScopedTx } from '../../data/org-scope';
import { conditionsRepo } from '../conditions/repository';
import { getRollup } from '../measurements/rollup';
import { takeoffsRepo } from '../takeoffs/repository';
import { NotFound } from '../source-files/errors';
import type { ReportConditionRow, ReportData } from './render';

/**
 * Assemble a report's rows from the authoritative state: every condition of the takeoff joined to
 * its cached {@link getRollup} quantity. Reads only — never recomputes — so the export equals the
 * rollup by construction (P1-13 caveat / P1-14 parity gate). A condition with no measurements yet
 * has no rollup row and contributes zeros.
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
    const rollup = await getRollup(tx, condition.id);
    const trade = tradeById.get(condition.trade_category_id);
    rows.push({
      conditionId: condition.id,
      conditionName: condition.name,
      tradeName: trade?.name ?? 'Uncategorized',
      tradeDivision: trade?.division_code ?? '',
      tradeSortOrder: trade?.sort_order ?? Number.MAX_SAFE_INTEGER,
      measurementType: condition.measurement_type,
      unit: condition.unit,
      baseQuantity: rollup?.base_quantity ?? 0,
      quantityWithWaste: rollup?.quantity_with_waste ?? 0,
      measurementCount: rollup?.measurement_count ?? 0,
      derivedVolume: rollup?.derived_volume ?? null,
      derivedSurfaceArea: rollup?.derived_surface_area ?? null,
      unitCostMinor: condition.unit_cost_minor ?? null,
      extendedCostMinor: rollup?.extended_cost_minor ?? null,
    });
  }
  return { takeoffId, rows };
}
