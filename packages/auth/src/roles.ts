import { CUSTOMER_ROLE_RANK, type CustomerRole } from '@takeoff/contracts';

/** Numeric privilege rank of a customer role (OWNER highest). */
export function roleRank(role: CustomerRole): number {
  return CUSTOMER_ROLE_RANK[role];
}

/**
 * True when `role` is at least as privileged as `minimum`, per the hierarchy
 * OWNER ⊇ ADMIN ⊇ ESTIMATOR_MEMBER ⊇ VIEWER (spec §6.1).
 */
export function isAtLeast(role: CustomerRole, minimum: CustomerRole): boolean {
  return CUSTOMER_ROLE_RANK[role] >= CUSTOMER_ROLE_RANK[minimum];
}
