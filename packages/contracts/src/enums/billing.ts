import { z } from 'zod';

/** Billable metered event (spec §5.6, UsageRecord.metric). */
export const UsageMetric = z.enum(['AI_TAKEOFF_RUN', 'MANAGED_ORDER', 'EXPORT']);
export type UsageMetric = z.infer<typeof UsageMetric>;

/**
 * Estimator payout status (spec §5.6, PayoutRecord.status).
 * PENDING → PAID, or → REVERSED. Disputes pause payouts pending resolution (spec §11.5).
 */
export const PayoutStatus = z.enum(['PENDING', 'PAID', 'REVERSED']);
export type PayoutStatus = z.infer<typeof PayoutStatus>;

/**
 * Subscription status (spec §5.6, Subscription.status) — mirrors the payment provider, which
 * is the source of truth (spec §17). Provisional value set for Phase 4; reconcile with the
 * provider's actual statuses when billing is wired.
 */
export const SubscriptionStatus = z.enum([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
  'PAUSED',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

/** Export file format (spec §5.6, Report.format). */
export const ReportFormat = z.enum(['PDF', 'XLSX', 'CSV']);
export type ReportFormat = z.infer<typeof ReportFormat>;

/** Report template (spec §5.6 / §6.6, Report.template). */
export const ReportTemplate = z.enum(['SUMMARY', 'DETAILED', 'BY_TRADE', 'MARKED_PLANS']);
export type ReportTemplate = z.infer<typeof ReportTemplate>;

/**
 * Report generation status (spec §5.6, Report.status). Exports run as background jobs
 * (spec §6.6); provisional lifecycle: QUEUED → GENERATING → READY | FAILED.
 */
export const ReportStatus = z.enum(['QUEUED', 'GENERATING', 'READY', 'FAILED']);
export type ReportStatus = z.infer<typeof ReportStatus>;

/**
 * Retainer ledger entry type (spec §11.5, P4-03). The retainer balance is the running sum of an
 * append-only ledger: TOP_UP credits it (a prepaid deposit), DRAW debits it (a managed order drawn
 * against it), REVERSAL credits back a prior draw (e.g. a cancelled/disputed order). Amounts are
 * stored signed (credits positive, draws negative) so the ledger sums to the balance.
 */
export const RetainerLedgerEntryType = z.enum(['TOP_UP', 'DRAW', 'REVERSAL']);
export type RetainerLedgerEntryType = z.infer<typeof RetainerLedgerEntryType>;
