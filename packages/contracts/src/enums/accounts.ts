import { z } from 'zod';

/**
 * Customer-org roles (spec §2.2). Hierarchy: OWNER ⊇ ADMIN ⊇ ESTIMATOR_MEMBER ⊇ VIEWER.
 * - OWNER: full control of the account, billing, members, all projects.
 * - ADMIN: manage members and projects; no billing control.
 * - ESTIMATOR_MEMBER: create/run/edit takeoffs within assigned projects.
 * - VIEWER: read-only; can read and export but cannot create or edit measurements.
 */
export const CustomerRole = z.enum(['OWNER', 'ADMIN', 'ESTIMATOR_MEMBER', 'VIEWER']);
export type CustomerRole = z.infer<typeof CustomerRole>;

/** Customer roles ordered most → least privileged (used for hierarchy checks in P0-06). */
export const CUSTOMER_ROLE_RANK: Readonly<Record<CustomerRole, number>> = {
  OWNER: 3,
  ADMIN: 2,
  ESTIMATOR_MEMBER: 1,
  VIEWER: 0,
};

/**
 * Platform/service-side roles (spec §2.2). Assigned per platform, not per org. A service
 * role only acts on resources via explicitly assigned orders — never ambient access.
 * - SERVICE_ESTIMATOR: claim and fulfill managed-service orders across customer orgs.
 * - SERVICE_QA: review and approve fulfilled orders before delivery.
 * - PLATFORM_ADMIN: full operational control, support impersonation, configuration.
 */
export const ServiceRole = z.enum(['SERVICE_ESTIMATOR', 'SERVICE_QA', 'PLATFORM_ADMIN']);
export type ServiceRole = z.infer<typeof ServiceRole>;

/** Organization subscription tier (spec §5.1, Organization.plan_tier). */
export const PlanTier = z.enum(['FREE', 'STARTER', 'PRO', 'RETAINER']);
export type PlanTier = z.infer<typeof PlanTier>;

/**
 * Organization account status (spec §5.1, Organization.status).
 * Transitions (provisional, enforced with billing in Phase 4): ACTIVE ↔ PAST_DUE,
 * either → SUSPENDED, SUSPENDED → ACTIVE on reinstatement.
 */
export const OrganizationStatus = z.enum(['ACTIVE', 'PAST_DUE', 'SUSPENDED']);
export type OrganizationStatus = z.infer<typeof OrganizationStatus>;

/**
 * User account status (spec §5.1, User.status).
 * - INVITED: provisioned but has not accepted/logged in.
 * - ACTIVE: normal.
 * - DISABLED: access revoked; tokens rejected (P0-05).
 */
export const UserStatus = z.enum(['ACTIVE', 'INVITED', 'DISABLED']);
export type UserStatus = z.infer<typeof UserStatus>;
