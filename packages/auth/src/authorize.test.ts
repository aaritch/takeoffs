import { describe, it, expect } from 'vitest';
import { CustomerRole } from '@takeoff/contracts';
import {
  authorize,
  can,
  hasCustomerCapability,
  isAtLeast,
  roleRank,
  CUSTOMER_ACTIONS,
  type AuthContext,
  type CustomerAction,
} from './index';

/** The exact set of actions each role should be allowed (spec §6.1). Cumulative by rank. */
const EXPECTED_ALLOWED: Record<CustomerRole, CustomerAction[]> = {
  VIEWER: ['org:read', 'report:export'],
  ESTIMATOR_MEMBER: [
    'org:read',
    'report:export',
    'project:create',
    'project:update',
    'measurement:write',
    'takeoff:write',
  ],
  ADMIN: [
    'org:read',
    'report:export',
    'project:create',
    'project:update',
    'measurement:write',
    'takeoff:write',
    'project:delete',
    'members:manage',
  ],
  OWNER: [...CUSTOMER_ACTIONS], // everything
};

describe('role hierarchy', () => {
  it('ranks OWNER > ADMIN > ESTIMATOR_MEMBER > VIEWER', () => {
    expect(roleRank('OWNER')).toBeGreaterThan(roleRank('ADMIN'));
    expect(roleRank('ADMIN')).toBeGreaterThan(roleRank('ESTIMATOR_MEMBER'));
    expect(roleRank('ESTIMATOR_MEMBER')).toBeGreaterThan(roleRank('VIEWER'));
  });

  it('isAtLeast respects the hierarchy', () => {
    expect(isAtLeast('OWNER', 'VIEWER')).toBe(true);
    expect(isAtLeast('VIEWER', 'OWNER')).toBe(false);
    expect(isAtLeast('ADMIN', 'ADMIN')).toBe(true);
  });
});

describe('permission matrix (each role can do exactly what it should)', () => {
  for (const role of CustomerRole.options) {
    const allowed = new Set(EXPECTED_ALLOWED[role]);
    for (const action of CUSTOMER_ACTIONS) {
      const shouldAllow = allowed.has(action);
      it(`${role} ${shouldAllow ? 'CAN' : 'cannot'} ${action}`, () => {
        expect(hasCustomerCapability(role, action)).toBe(shouldAllow);
      });
    }
  }
});

describe('authorize (org isolation first, then role)', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const ctx = (role: CustomerRole, orgId = orgA): AuthContext => ({
    userId: 'u1',
    membershipsByOrg: new Map([[orgId, role]]),
  });

  it('denies fail-closed when the actor has no membership in the resource org', () => {
    const decision = authorize(ctx('OWNER', orgA), 'org:read', { orgId: orgB });
    expect(decision).toEqual({ allowed: false, reason: 'NO_ACTIVE_MEMBERSHIP' });
  });

  it('denies a service-only actor (no customer membership) — no ambient access', () => {
    const serviceOnly: AuthContext = {
      userId: 'svc',
      membershipsByOrg: new Map(),
      serviceRole: 'SERVICE_ESTIMATOR',
    };
    expect(can(serviceOnly, 'org:read', { orgId: orgA })).toBe(false);
  });

  it('allows when membership exists and the role is sufficient', () => {
    expect(can(ctx('ADMIN'), 'members:manage', { orgId: orgA })).toBe(true);
  });

  it('denies with INSUFFICIENT_ROLE when membership exists but role is too low', () => {
    expect(authorize(ctx('VIEWER'), 'measurement:write', { orgId: orgA })).toEqual({
      allowed: false,
      reason: 'INSUFFICIENT_ROLE',
    });
  });

  it('VIEWER can read and export but cannot create or edit', () => {
    const viewer = ctx('VIEWER');
    expect(can(viewer, 'org:read', { orgId: orgA })).toBe(true);
    expect(can(viewer, 'report:export', { orgId: orgA })).toBe(true);
    expect(can(viewer, 'project:create', { orgId: orgA })).toBe(false);
    expect(can(viewer, 'measurement:write', { orgId: orgA })).toBe(false);
  });

  it('only OWNER touches billing', () => {
    expect(can(ctx('OWNER'), 'billing:manage', { orgId: orgA })).toBe(true);
    expect(can(ctx('ADMIN'), 'billing:manage', { orgId: orgA })).toBe(false);
  });
});
