import { NextResponse } from 'next/server';
import { CreateMeasurementRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { sheetsRepo } from '@/server/modules/ingestion';
import { measurementsService, measurementToView } from '@/server/modules/measurements';
import { NotFound, ValidationFailed } from '@/server/modules/source-files';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/conditions/{id}/measurements — attach a measurement to the active condition (P1-09).
 * The client sends only geometry; the server computes the quantity from the sheet's confirmed
 * scale. Length/area enforce the scale gate (a CONFIRMED scale is required first).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: conditionId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, CreateMeasurementRequest);
    const measurement = await withOrgScope(getAppDb(), orgId, async (tx) => {
      const sheet = await sheetsRepo.getById(tx, body.sheetId);
      if (!sheet) throw NotFound('Sheet not found');

      const needsScale = body.geometry.type === 'POLYLINE' || body.geometry.type === 'POLYGON';
      if (needsScale && (sheet.scale_status !== 'CONFIRMED' || !sheet.unit_per_pixel)) {
        throw ValidationFailed('Confirm the sheet scale before measuring length or area', {
          field: 'scale',
        });
      }

      const result = await measurementsService.create(tx, {
        condition_id: conditionId,
        sheet_id: body.sheetId,
        geometry: body.geometry,
        unit_per_pixel: sheet.unit_per_pixel ?? 0,
      });
      return measurementToView(result.measurement);
    });
    return NextResponse.json({ measurement }, { status: 201 });
  });
}
