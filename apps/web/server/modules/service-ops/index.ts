// Service-ops module (P3-04) — managed-service fulfillment operations. Today: estimator assignment
// + capacity (cross-org, platform-side) and the estimator-isolation gate. QA/delivery/ops-dashboard
// build on this in later Phase-3 tasks.
export { assignmentService } from './assignment';
export type { AssignmentResult } from './assignment';
export { fulfillmentService } from './fulfillment';
export type { FulfillmentStart } from './fulfillment';
export { qaService } from './qa';
export type { QaChecklist, QaAttestation } from './qa';
export { deliveryService } from './delivery';
export { loggingOrderNotifier } from './notifier';
export type { OrderNotifier, OrderNotice } from './notifier';
export { opsDashboardService, computeSla, SLA_RISK_FRACTION } from './ops-dashboard';
export type { OrderSla } from './ops-dashboard';
export { payoutService, payoutToView, computePayoutAmount, ESTIMATOR_PAYOUT_RATE } from './payouts';
export type { PayoutDeps } from './payouts';
export { payoutRecordsRepo } from './payout-repo';
export type { PayoutRecord } from './payout-repo';
export { serviceProfilesRepo } from './repository';
export type { ServiceProfile } from './repository';
export { isEligible, pickEstimator, specialtiesMatch } from './eligibility';
export type { EstimatorCandidate } from './eligibility';
