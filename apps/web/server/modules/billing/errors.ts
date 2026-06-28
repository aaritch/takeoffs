export type BillingErrorCode = 'QUOTA_EXCEEDED' | 'FEATURE_NOT_AVAILABLE';

/**
 * Billing/quota domain error (P4-02). `QUOTA_EXCEEDED` = the action would cross a hard (BLOCK) plan
 * quota; `FEATURE_NOT_AVAILABLE` = the plan doesn't include the feature at all. Both map to 402
 * (Payment Required → upgrade) at the API boundary.
 */
export class BillingError extends Error {
  readonly code: BillingErrorCode;
  constructor(code: BillingErrorCode, message: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}

export const QuotaExceeded = (message: string) => new BillingError('QUOTA_EXCEEDED', message);
export const FeatureNotAvailable = (message: string) =>
  new BillingError('FEATURE_NOT_AVAILABLE', message);
