import { NextResponse } from 'next/server';
import { CreateConditionRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { createSheetCondition, listSheetConditions } from '@/server/modules/conditions';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/sheets/{id}/conditions — the trade buckets a measurement can attach to (P1-09). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const conditions = await withOrgScope(getAppDb(), orgId, (tx) => listSheetConditions(tx, id));
    return NextResponse.json({ conditions });
  });
}

/** POST /v1/sheets/{id}/conditions — create a condition on the sheet's takeoff. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, CreateConditionRequest);
    const condition = await withOrgScope(getAppDb(), orgId, (tx) =>
      createSheetCondition(tx, id, body),
    );
    return NextResponse.json({ condition }, { status: 201 });
  });
}
