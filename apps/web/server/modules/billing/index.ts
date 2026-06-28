// Billing — subscriptions & seats (P4-01). The payment provider is the source of truth; we reconcile
// its webhooks idempotently and order-safely into a Subscription + the org's entitlements (plan, seat
// limit, account status). Seat limits enforce against membership via the Phase-0 accounts service.
export { PLAN_CATALOG, entitlementsForTier } from './catalog';
export { deriveOrgEntitlements, type OrgEntitlementState } from './entitlements';
export { billingWebhookService, type ReconcileOutcome } from './webhook';
export {
  subscriptionsRepo,
  billingEventsRepo,
  type Subscription,
  type BillingEvent,
} from './repository';
export { subscriptionToView } from './view';
export { stubBillingProvider, type BillingProvider } from './provider';
// Usage metering & quotas (P4-02).
export { meteringService, type MeterInput } from './metering';
export { usageRecordsRepo, type UsageRecord } from './usage-repo';
export {
  quotaDecision,
  metricLimit,
  billingPeriod,
  QUOTA_POLICY,
  type QuotaDecision,
  type QuotaPolicy,
  type QuotaOutcome,
} from './quota';
export { BillingError, QuotaExceeded, FeatureNotAvailable, type BillingErrorCode } from './errors';
