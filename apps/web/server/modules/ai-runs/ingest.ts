import type { SheetInferenceResult } from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { conditionsService, resolveSheetTakeoff } from '../conditions';
import type { Condition } from '../conditions/repository';
import { sheetsRepo } from '../ingestion';
import { computeRawValue } from '../measurements/geometry';
import { measurementsRepo } from '../measurements';
import { NotFound, ValidationFailed } from '../source-files/errors';
import { tradesRepo } from '../trades/repository';

/**
 * Ingest one sheet's inference result as candidate measurements (P2-03). Each candidate becomes a
 * Measurement row with source=AI, review_status=UNREVIEWED — never silently authoritative
 * (CLAUDE.md §8). Because UNREVIEWED rows are excluded from rollups, candidates do NOT move any
 * authoritative quantity until a human accepts them.
 *
 * Two invariants are enforced here:
 *  - Quantities are server-authoritative: `raw_value` is recomputed from the candidate geometry +
 *    the sheet scale, NEVER taken from the model's reported value.
 *  - Re-running a sheet replaces its prior candidate set (soft-deletes the old UNREVIEWED AI rows
 *    first), so retries never duplicate candidates.
 *
 * Returns the number of candidates written.
 */
export async function ingestSheetCandidates(
  tx: OrgScopedTx,
  result: SheetInferenceResult,
): Promise<number> {
  const sheet = await sheetsRepo.getById(tx, result.sheetId);
  if (!sheet) throw NotFound('Sheet not found');
  const takeoffId = await resolveSheetTakeoff(tx, result.sheetId);
  const orgId = await currentOrgId(tx);

  // Replace prior candidates for this sheet before inserting the new set (idempotent re-run).
  await measurementsRepo.softDeleteAiCandidatesForSheet(tx, result.sheetId);
  if (result.candidates.length === 0) return 0;

  const categories = await tradesRepo.listCategories(tx);
  if (categories.length === 0) throw ValidationFailed('No trade categories are available');
  const defaultCategoryId = categories[0]!.id;

  // Match candidates to existing conditions by AI object class; create one per new class.
  const existing = await conditionsService.list(tx, takeoffId);
  const byClass = new Map<string, Condition>();
  for (const c of existing) if (c.ai_object_class) byClass.set(c.ai_object_class, c);

  const unitPerPixel = sheet.unit_per_pixel ?? 0;
  let count = 0;
  for (const candidate of result.candidates) {
    let condition = byClass.get(candidate.objectClass);
    if (!condition) {
      condition = await conditionsService.create(tx, {
        takeoff_id: takeoffId,
        trade_category_id: defaultCategoryId,
        name: candidate.conditionKey,
        measurement_type: candidate.measurementType,
        unit: candidate.unit,
        ai_object_class: candidate.objectClass,
      });
      byClass.set(candidate.objectClass, condition);
    }

    await measurementsRepo.insert(tx, {
      org_id: orgId,
      condition_id: condition.id,
      sheet_id: result.sheetId,
      geom_type: candidate.geometry.type,
      geometry: candidate.geometry,
      raw_value: computeRawValue(candidate.geometry, unitPerPixel),
      source: 'AI',
      ai_confidence: candidate.aiConfidence,
      review_status: 'UNREVIEWED',
      model_run_id: result.modelRunId,
    });
    count += 1;
  }
  return count;
}
