// Payments module — the payment-authorization seam (P3-03 stub) + the retainer lifecycle (P4-03).
// Placement secures payment (a charge authorization or a retainer draw) before an order enters the
// queue. The real provider (Stripe) lands later behind PaymentAuthorizer; the retainer balance and
// its draw-down are now backed by an append-only ledger that the balance reconciles to.
export { stubAuthorizer } from './authorizer';
export type { PaymentAuthorizer, ChargeRequest, ChargeAuthorization } from './authorizer';
export { retainersRepo } from './retainers';
export type { Retainer } from './retainers';
export { retainerLedgerRepo } from './ledger';
export type { RetainerLedgerEntry } from './ledger';
export { retainerService } from './retainer-service';
export type { TopUpOptions, DrawOptions } from './retainer-service';
export { retainerToView, ledgerEntryToView, RETAINER_CURRENCY } from './view';
