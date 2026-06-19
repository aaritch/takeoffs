import { NextResponse } from 'next/server';
import { UpdateSheetMetadataRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { updateSheetMetadata } from '@/server/modules/ingestion';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** PATCH /v1/sheets/{id} — edit sheet metadata; edits win over future re-extraction. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, UpdateSheetMetadataRequest);
    const sheet = await withOrgScope(getAppDb(), orgId, (tx) => updateSheetMetadata(tx, id, body));
    return NextResponse.json({ sheet });
  });
}
