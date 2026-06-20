import type { ConditionView, CreateConditionRequest } from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { sheetsRepo } from '../ingestion/repository';
import { planSetsRepo } from '../source-files/repository';
import { NotFound, ValidationFailed } from '../source-files/errors';
import { takeoffsRepo } from '../takeoffs/repository';
import { tradesRepo } from '../trades/repository';
import { conditionsService } from './service';
import type { Condition } from './repository';

/**
 * Conditions for the measurement toolbar (P1-09): list/create the trade buckets a drawn
 * measurement attaches to, resolved from the sheet. A sheet's plan set lazily gets one default
 * takeoff (its condition container) the first time conditions are touched.
 */

function conditionToView(c: Condition): ConditionView {
  return {
    id: c.id,
    name: c.name,
    measurementType: c.measurement_type,
    unit: c.unit,
    colorHex: c.color_hex,
  };
}

async function resolveSheetTakeoff(tx: OrgScopedTx, sheetId: string): Promise<string> {
  const sheet = await sheetsRepo.getById(tx, sheetId);
  if (!sheet) throw NotFound('Sheet not found');
  const existing = await takeoffsRepo.firstForPlanSet(tx, sheet.plan_set_id);
  if (existing) return existing.id;

  const planSet = await planSetsRepo.getById(tx, sheet.plan_set_id);
  if (!planSet) throw NotFound('Plan set not found');
  const created = await takeoffsRepo.insert(tx, {
    org_id: await currentOrgId(tx),
    project_id: planSet.project_id,
    plan_set_id: sheet.plan_set_id,
  });
  return created.id;
}

export async function listSheetConditions(
  tx: OrgScopedTx,
  sheetId: string,
): Promise<ConditionView[]> {
  const takeoffId = await resolveSheetTakeoff(tx, sheetId);
  const conditions = await conditionsService.list(tx, takeoffId);
  return conditions.map(conditionToView);
}

export async function createSheetCondition(
  tx: OrgScopedTx,
  sheetId: string,
  input: CreateConditionRequest,
): Promise<ConditionView> {
  const takeoffId = await resolveSheetTakeoff(tx, sheetId);
  const categories = await tradesRepo.listCategories(tx);
  if (categories.length === 0) throw ValidationFailed('No trade categories are available');

  const condition = await conditionsService.create(tx, {
    takeoff_id: takeoffId,
    trade_category_id: categories[0]!.id,
    name: input.name,
    measurement_type: input.measurementType,
    unit: input.unit,
  });
  return conditionToView(condition);
}
