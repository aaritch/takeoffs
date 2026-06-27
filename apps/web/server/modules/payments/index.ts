// Payments module (P3-03 stub) — the payment-authorization seam + retainer draw used at order
// placement. The real provider (Stripe) and the full retainer lifecycle land in Phase 4; placement
// depends on these interfaces so swapping the real implementations in is a localized change.
export { stubAuthorizer } from './authorizer';
export type { PaymentAuthorizer, ChargeRequest, ChargeAuthorization } from './authorizer';
export { retainersRepo } from './retainers';
export type { Retainer } from './retainers';
