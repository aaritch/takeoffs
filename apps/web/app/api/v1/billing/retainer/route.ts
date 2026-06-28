import { NextResponse } from 'next/server';
import type { RetainerResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { ledgerEntryToView, retainerService, retainerToView } from '@/server/modules/payments';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/billing/retainer — the caller's org retainer balance + its ledger, newest first (P4-03). */
export async function GET(request: Request) {
  return apiHandler(request, async ({ orgId }) => {
    const { retainer, ledger } = await withOrgScope(getAppDb(), orgId, async (tx) => ({
      retainer: await retainerService.getByOrg(tx, orgId),
      ledger: await retainerService.ledger(tx, orgId),
    }));
    const body: RetainerResponse = {
      retainer: retainer ? retainerToView(retainer) : null,
      ledger: ledger.map(ledgerEntryToView),
    };
    return NextResponse.json(body);
  });
}
