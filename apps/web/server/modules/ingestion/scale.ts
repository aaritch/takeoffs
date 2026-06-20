import { unitPerPixelFromTwoPoints, type LengthInputUnit } from '@takeoff/geometry';
import type { CalibrateScaleRequest, SheetView } from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { NotFound, ValidationFailed } from '../source-files/errors';
import { sheetToView } from './metadata';
import { sheetsRepo } from './repository';

/**
 * Two-point manual scale calibration (P1-08/P1-09): the user draws a reference segment and enters
 * its real length; we derive FEET-per-normalized-pixel and CONFIRM the sheet's scale. From then on
 * the server computes length/area quantities from this — the client never supplies the scale.
 */
export async function calibrateScale(
  tx: OrgScopedTx,
  sheetId: string,
  input: CalibrateScaleRequest,
): Promise<SheetView> {
  const sheet = await sheetsRepo.getById(tx, sheetId);
  if (!sheet) throw NotFound('Sheet not found');

  let unitPerPixel: number;
  try {
    unitPerPixel = unitPerPixelFromTwoPoints(
      input.p1,
      input.p2,
      input.realLength,
      input.lengthUnit as LengthInputUnit,
    );
  } catch (e) {
    throw ValidationFailed(e instanceof Error ? e.message : 'Invalid calibration', { field: 'p1' });
  }

  await sheetsRepo.update(tx, sheetId, {
    unit_per_pixel: unitPerPixel,
    scale_units: input.units,
    scale_status: 'CONFIRMED',
  });
  const updated = await sheetsRepo.getById(tx, sheetId);
  return sheetToView(updated!);
}
