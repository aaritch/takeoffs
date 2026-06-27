// Service-ops module (P3-04) — managed-service fulfillment operations. Today: estimator assignment
// + capacity (cross-org, platform-side) and the estimator-isolation gate. QA/delivery/ops-dashboard
// build on this in later Phase-3 tasks.
export { assignmentService } from './assignment';
export type { AssignmentResult } from './assignment';
export { fulfillmentService } from './fulfillment';
export type { FulfillmentStart } from './fulfillment';
export { qaService } from './qa';
export type { QaChecklist, QaAttestation } from './qa';
export { serviceProfilesRepo } from './repository';
export type { ServiceProfile } from './repository';
export { isEligible, pickEstimator, specialtiesMatch } from './eligibility';
export type { EstimatorCandidate } from './eligibility';
