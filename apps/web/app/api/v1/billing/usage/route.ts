import { NextResponse } from 'next/server';
import type { UsageSummaryResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { meteringService } from '@/server/modules/billing';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/billing/usage — the caller's org current-period usage vs plan quotas (P4-02). */
export async function GET(request: Request) {
  return apiHandler(request, async ({ orgId }) => {
    const usage = await withOrgScope(getAppDb(), orgId, (tx) =>
      meteringService.summarize(tx, orgId),
    );
    const body: UsageSummaryResponse = { usage };
    return NextResponse.json(body);
  });
}
