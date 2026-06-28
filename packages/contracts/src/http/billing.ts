import { z } from 'zod';
import { PlanTier } from '../enums/accounts';
import {
  PayoutStatus,
  RetainerLedgerEntryType,
  SubscriptionStatus,
  UsageMetric,
} from '../enums/billing';

/**
 * Subscriptions & seats (P4-01). The payment provider is the source of truth for subscription and
 * payment state; we reconcile to its webhooks (which can arrive out of order and be retried). These
 * shapes are the provider-agnostic seam: a provider adapter verifies + normalizes a raw webhook into
 * a {@link BillingSubscriptionEvent}; the reconciler applies it idempotently.
 */

/**
 * What a plan tier grants. Seat limit is enforced against membership (P0-06); the quota numbers feed
 * usage metering (P4-02). `-1` means unlimited. The concrete numbers are a business decision
 * (provisional — STATE §7 TBD).
 */
export const Entitlements = z.object({
  seatLimit: z.number().int().positive(),
  aiTakeoffRunsPerMonth: z.number().int(),
  exportsPerMonth: z.number().int(),
  managedOrders: z.boolean(),
});
export type Entitlements = z.infer<typeof Entitlements>;

/** An org's current subscription, reconciled from the provider. */
export const SubscriptionView = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  providerCustomerRef: z.string().nullable(),
  providerSubscriptionRef: z.string(),
  status: SubscriptionStatus,
  planTier: PlanTier,
  seatLimit: z.number().int().positive(),
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  entitlements: Entitlements,
  createdAt: z.string().datetime(),
});
export type SubscriptionView = z.infer<typeof SubscriptionView>;

/** GET /v1/billing/subscription — an org's subscription + entitlements (null before they subscribe). */
export const SubscriptionResponse = z.object({ subscription: SubscriptionView.nullable() });
export type SubscriptionResponse = z.infer<typeof SubscriptionResponse>;

/** The billing events we reconcile. Provider-specific event names are normalized to these. */
export const BillingEventType = z.enum([
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_UPDATED',
  'SUBSCRIPTION_DELETED',
  'PAYMENT_FAILED',
  'PAYMENT_SUCCEEDED',
]);
export type BillingEventType = z.infer<typeof BillingEventType>;

/**
 * A normalized subscription webhook event. `providerEventId` is the idempotency key (the same event
 * may be delivered more than once); `occurredAt` orders events so a retried/stale delivery cannot
 * overwrite newer state. `orgId` is resolved by the provider adapter from the customer's metadata.
 */
export const BillingSubscriptionEvent = z.object({
  providerEventId: z.string().min(1),
  type: BillingEventType,
  occurredAt: z.string().datetime(),
  orgId: z.string().uuid(),
  customerRef: z.string().min(1),
  subscriptionRef: z.string().min(1),
  status: SubscriptionStatus,
  planTier: PlanTier,
  currentPeriodEnd: z.string().datetime().nullable().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});
export type BillingSubscriptionEvent = z.infer<typeof BillingSubscriptionEvent>;

/** POST /v1/billing/webhook — acknowledgement. `applied=false` for a duplicate or stale event. */
export const BillingWebhookResponse = z.object({
  received: z.literal(true),
  applied: z.boolean(),
  reason: z.string().optional(),
});
export type BillingWebhookResponse = z.infer<typeof BillingWebhookResponse>;

/**
 * Usage metering & quotas (P4-02). Billable events (AI takeoff runs, managed orders, exports) are
 * metered as UsageRecords exactly-once relative to the underlying action; quotas are enforced per
 * plan and surfaced to the customer. `-1` limit means unlimited.
 */
export const UsageRecordView = z.object({
  id: z.string().uuid(),
  metric: UsageMetric,
  quantity: z.number().int(),
  referenceId: z.string().uuid(),
  period: z.string(),
  billed: z.boolean(),
  occurredAt: z.string().datetime(),
});
export type UsageRecordView = z.infer<typeof UsageRecordView>;

/** Per-metric usage for a billing period: how much used against the plan's limit. */
export const MetricUsageView = z.object({
  metric: UsageMetric,
  used: z.number().int(),
  limit: z.number().int(),
  remaining: z.number().int(),
  overQuota: z.boolean(),
});
export type MetricUsageView = z.infer<typeof MetricUsageView>;

/** GET /v1/billing/usage — the org's current-period usage across all metered events. */
export const UsageSummaryView = z.object({
  period: z.string(),
  planTier: PlanTier,
  metrics: z.array(MetricUsageView),
});
export type UsageSummaryView = z.infer<typeof UsageSummaryView>;

export const UsageSummaryResponse = z.object({ usage: UsageSummaryView });
export type UsageSummaryResponse = z.infer<typeof UsageSummaryResponse>;

/**
 * Retainers & draw-down (P4-03). An org's prepaid managed-service balance, backed by an append-only
 * ledger; the balance is the running sum of the ledger and reconciles to it at all times. Money is
 * integer minor units (cents) with an ISO-4217 code.
 */
export const RetainerView = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  balanceMinor: z.number().int(),
  currency: z.string(),
  updatedAt: z.string().datetime(),
});
export type RetainerView = z.infer<typeof RetainerView>;

export const RetainerLedgerEntryView = z.object({
  id: z.string().uuid(),
  entryType: RetainerLedgerEntryType,
  amountMinor: z.number().int(),
  balanceAfterMinor: z.number().int(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type RetainerLedgerEntryView = z.infer<typeof RetainerLedgerEntryView>;

/** GET /v1/billing/retainer — the org's retainer balance + its recent ledger (newest first). */
export const RetainerResponse = z.object({
  retainer: RetainerView.nullable(),
  ledger: z.array(RetainerLedgerEntryView),
});
export type RetainerResponse = z.infer<typeof RetainerResponse>;

/** POST /v1/billing/retainer/top-ups — add funds to the retainer (after the payment is secured). */
export const TopUpRetainerRequest = z.object({
  amountMinor: z.number().int().positive(),
  paymentReference: z.string().optional(),
});
export type TopUpRetainerRequest = z.infer<typeof TopUpRetainerRequest>;

/**
 * Estimator payouts (spec §5.6/§11.5, P4-04). A payout is created + settled only when its order is
 * ACCEPTED (or auto-accepted); disputes never pay out. Higher-stakes than payments in, so it carries
 * full status + provider-reference history for reconciliation.
 */
export const PayoutView = z.object({
  id: z.string().uuid(),
  serviceProfileId: z.string().uuid(),
  orderId: z.string().uuid(),
  amountMinor: z.number().int(),
  currency: z.string(),
  status: PayoutStatus,
  providerTransferRef: z.string().nullable(),
  providerReversalRef: z.string().nullable(),
  reversalReason: z.string().nullable(),
  settledAt: z.string().datetime().nullable(),
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type PayoutView = z.infer<typeof PayoutView>;

/** GET /v1/ops/payouts — payouts (platform view), optionally filtered by estimator. */
export const PayoutsResponse = z.object({ payouts: z.array(PayoutView) });
export type PayoutsResponse = z.infer<typeof PayoutsResponse>;

/** POST /v1/ops/payouts/{id}/reverse — reverse a settled payout (platform admin). */
export const ReversePayoutRequest = z.object({ reason: z.string().min(1) });
export type ReversePayoutRequest = z.infer<typeof ReversePayoutRequest>;
