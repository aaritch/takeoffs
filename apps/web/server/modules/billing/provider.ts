import { BillingSubscriptionEvent } from '@takeoff/contracts';

/**
 * Payment-provider seam (P4-01). A provider adapter VERIFIES a raw webhook (signature) and NORMALIZES
 * it into our provider-agnostic {@link BillingSubscriptionEvent}. The reconciler (webhook.ts) depends
 * only on this interface, so swapping in Stripe later (signature verification + event mapping) is a
 * drop-in — exactly like the P3-03 `PaymentAuthorizer` stub.
 */
export interface BillingProvider {
  /** Verify the signature over the raw body and parse it into a normalized event. Throws if invalid. */
  verifyAndParse(rawBody: string, signature: string | null): BillingSubscriptionEvent;
}

/**
 * Stub provider used until Stripe is wired. Trusts the body as an already-normalized event (validated
 * against the contract). Real signature verification is the Stripe adapter's job — NOT this stub's,
 * so a webhook route using this must be reachable only in non-production / behind a shared secret.
 */
export const stubBillingProvider: BillingProvider = {
  verifyAndParse(rawBody) {
    return BillingSubscriptionEvent.parse(JSON.parse(rawBody));
  },
};
