/**
 * Payout provider seam (P4-04) — the rail that moves money OUT to an estimator (Stripe Connect
 * transfers/reversals later). Payments out are higher-stakes than in, so the service depends on this
 * interface and records every transfer's provider reference; the real adapter is a localized swap,
 * like the P3-03 `PaymentAuthorizer`. Transfers are initiated only server-side, never from a client.
 */

export interface PayoutTransferRequest {
  payoutId: string;
  estimatorAccountRef: string;
  amountMinor: number;
  currency: string;
}

export interface PayoutReversalRequest {
  transferRef: string;
  amountMinor: number;
}

export interface PayoutResult {
  ok: boolean;
  /** Provider reference (e.g. a Transfer id) when settled/reversed. */
  reference?: string;
  /** Human-readable failure reason when not. */
  reason?: string;
}

export interface PayoutProvider {
  transfer(req: PayoutTransferRequest): Promise<PayoutResult>;
  reverse(req: PayoutReversalRequest): Promise<PayoutResult>;
}

/**
 * Phase-4 stub: "transfers" succeed when the estimator has a payout account; reversals always
 * succeed. Replaced by the Stripe Connect adapter when live payouts are wired.
 */
export const stubPayoutProvider: PayoutProvider = {
  async transfer(req) {
    if (!req.estimatorAccountRef) return { ok: false, reason: 'Estimator has no payout account' };
    if (!(req.amountMinor > 0)) return { ok: false, reason: 'Amount must be positive' };
    return { ok: true, reference: `stub-transfer:${req.payoutId}` };
  },
  async reverse(req) {
    return { ok: true, reference: `stub-reversal:${req.transferRef}` };
  },
};
