import { NextResponse } from 'next/server';
import { CalibrateScaleRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { calibrateScale } from '@/server/modules/ingestion';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/sheets/{id}/scale — two-point manual scale calibration (P1-08/P1-09). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, CalibrateScaleRequest);
    const sheet = await withOrgScope(getAppDb(), orgId, (tx) => calibrateScale(tx, id, body));
    return NextResponse.json({ sheet });
  });
}
