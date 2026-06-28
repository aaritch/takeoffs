import { NextResponse } from 'next/server';
import { TopUpRetainerRequest, type RetainerResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import {
  ledgerEntryToView,
  retainerService,
  retainerToView,
  stubAuthorizer,
} from '@/server/modules/payments';
import { ApiError, apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/billing/retainer/top-ups — add prepaid funds to the org retainer (P4-03).
 *
 * Only OWNER/ADMIN may move money. The deposit is SECURED via the payment seam (Stripe later) before
 * the credit is recorded; on success the balance + a TOP_UP ledger entry commit together.
 */
export async function POST(request: Request) {
  return apiHandler(request, async ({ orgId, role }) => {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an owner or admin can top up the retainer.');
    }
    const { amountMinor, paymentReference } = await parseBody(request, TopUpRetainerRequest);

    const auth = await stubAuthorizer.authorizeCharge({
      orgId,
      orderId: `topup:${orgId}`,
      amountMinor,
    });
    if (!auth.ok) {
      throw new ApiError(402, 'PAYMENT_REQUIRED', auth.reason ?? 'Payment authorization failed');
    }

    const reference = paymentReference ?? auth.reference;
    const { retainer, entry } = await withOrgScope(getAppDb(), orgId, (tx) =>
      retainerService.topUp(
        tx,
        orgId,
        amountMinor,
        reference ? { paymentReference: reference } : {},
      ),
    );
    const body: RetainerResponse = {
      retainer: retainerToView(retainer),
      ledger: [ledgerEntryToView(entry)],
    };
    return NextResponse.json(body, { status: 201 });
  });
}
