import { NextResponse } from 'next/server';
import type { BillingWebhookResponse } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { billingWebhookService, stubBillingProvider } from '@/server/modules/billing';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/billing/webhook — the payment provider's subscription webhook (P4-01).
 *
 * NOT org-authenticated: the provider calls this, so trust comes from SIGNATURE VERIFICATION, not a
 * session. The provider adapter verifies the raw body + signature and normalizes the event; the
 * reconciler then applies it idempotently (duplicates and out-of-order deliveries are no-ops). We
 * return 200 on a duplicate/stale event too, so the provider stops retrying.
 *
 * Uses the stub provider until Stripe is wired (its adapter does real signature verification + event
 * mapping); the admin connection is used because the event is cross-org and has no org session.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-billing-signature');

  let event;
  try {
    event = stubBillingProvider.verifyAndParse(rawBody, signature);
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_WEBHOOK', message: 'Signature or payload invalid' } },
      { status: 400 },
    );
  }

  const outcome = await billingWebhookService.handleEvent(getDb(), event);
  const body: BillingWebhookResponse = {
    received: true,
    applied: outcome.applied,
    ...(outcome.applied ? {} : { reason: outcome.reason }),
  };
  return NextResponse.json(body);
}
