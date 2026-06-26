import { NextResponse } from 'next/server';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { pricingRuleToView, pricingRulesRepo } from '@/server/modules/pricing';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * GET /v1/pricing-rules — the current managed-service pricing/turnaround rules (P3-02). Read-only:
 * editing rules is a platform-admin operation (via the seed / admin tooling), never a customer call.
 */
export async function GET(request: Request, ctx: object) {
  void ctx;
  return apiHandler(request, async ({ orgId }) => {
    const rules = await withOrgScope(getAppDb(), orgId, (tx) => pricingRulesRepo.list(tx));
    return NextResponse.json({ rules: rules.map(pricingRuleToView) });
  });
}
