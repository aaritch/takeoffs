import { NextResponse } from 'next/server';
import { UpdateSheetMetadataRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { sheetsRepo, sheetToView, updateSheetMetadata } from '@/server/modules/ingestion';
import { NotFound } from '@/server/modules/source-files';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/sheets/{id} — the sheet (dimensions, tile keys, metadata) the viewer renders. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const sheet = await withOrgScope(getAppDb(), orgId, (tx) => sheetsRepo.getById(tx, id));
    if (!sheet) throw NotFound('Sheet not found');
    return NextResponse.json({ sheet: sheetToView(sheet) });
  });
}

/** PATCH /v1/sheets/{id} — edit sheet metadata; edits win over future re-extraction. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, UpdateSheetMetadataRequest);
    const sheet = await withOrgScope(getAppDb(), orgId, (tx) => updateSheetMetadata(tx, id, body));
    return NextResponse.json({ sheet });
  });
}
