import type { CustomerRole, ServiceRole } from '@takeoff/contracts';
import { hasCustomerCapability, type CustomerAction } from './permissions';

/**
 * Resolved authorization context for the current request. It MUST be built from durable
 * records (active memberships, service profile) on the server — never from token claims a
 * client could influence (spec §13.2 / P0-05 caveat).
 */
export interface AuthContext {
  userId: string;
  /** Active customer memberships keyed by org_id. Only accepted, non-removed memberships. */
  membershipsByOrg: ReadonlyMap<string, CustomerRole>;
  /** Platform/service role, if this user is service staff. */
  serviceRole?: ServiceRole;
}

/** The minimal shape of any org-owned resource the gate needs: which org owns it. */
export interface OrgResource {
  orgId: string;
}

export type Decision = { allowed: true } | { allowed: false; reason: DenyReason };

export type DenyReason = 'NO_ACTIVE_MEMBERSHIP' | 'INSUFFICIENT_ROLE';

const ALLOW: Decision = { allowed: true };

/**
 * The single authorization gate every customer endpoint calls (spec §6.1 / §13.2).
 *
 * Org isolation is the FIRST check and fails closed: if the actor has no active membership
 * in the resource's org, deny — whatever the action. Only then is the role hierarchy applied.
 *
 * Service-side roles get NO ambient access to customer resources; they act solely through
 * explicitly assigned orders (Phase 3). Until that grant mechanism exists, a service-only
 * actor (no membership in the org) is denied here — fail closed by construction.
 */
export function authorize(
  ctx: AuthContext,
  action: CustomerAction,
  resource: OrgResource,
): Decision {
  const role = ctx.membershipsByOrg.get(resource.orgId);
  if (!role) {
    return { allowed: false, reason: 'NO_ACTIVE_MEMBERSHIP' };
  }
  if (!hasCustomerCapability(role, action)) {
    return { allowed: false, reason: 'INSUFFICIENT_ROLE' };
  }
  return ALLOW;
}

/** Boolean convenience form of {@link authorize}. */
export function can(ctx: AuthContext, action: CustomerAction, resource: OrgResource): boolean {
  return authorize(ctx, action, resource).allowed;
}

/** Resolve the actor's role in a given org, or undefined if they have no active membership. */
export function roleInOrg(ctx: AuthContext, orgId: string): CustomerRole | undefined {
  return ctx.membershipsByOrg.get(orgId);
}

export type { ServiceRole };
