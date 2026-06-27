/**
 * Payment authorization seam (P3-03). Placement must SECURE payment before an order enters the
 * queue (the caveat: never let the service team fulfill unpaid orders). The real provider (Stripe)
 * lands in Phase 4; until then `stubAuthorizer` stands in. The orders service depends on this
 * interface, not a concrete provider, so swapping in Stripe is a one-line change.
 */

export interface ChargeRequest {
  orgId: string;
  orderId: string;
  amountMinor: number;
}

export interface ChargeAuthorization {
  ok: boolean;
  /** Provider reference (e.g. a PaymentIntent id) when authorized. */
  reference?: string;
  /** Human-readable decline reason when not authorized. */
  reason?: string;
}

export interface PaymentAuthorizer {
  authorizeCharge(req: ChargeRequest): Promise<ChargeAuthorization>;
}

/** Phase-3 stub: authorizes any positive amount. Replaced by the Stripe authorizer in Phase 4. */
export const stubAuthorizer: PaymentAuthorizer = {
  async authorizeCharge(req: ChargeRequest): Promise<ChargeAuthorization> {
    if (!(req.amountMinor > 0)) return { ok: false, reason: 'Amount must be positive' };
    return { ok: true, reference: `stub-auth:${req.orderId}` };
  },
};
