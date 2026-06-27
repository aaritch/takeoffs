import { describe, expect, it } from 'vitest';
import { ApiError } from './http-error';
import { resolvePlatformActor } from './platform-actor';
import type { ServiceProfile } from '../modules/accounts/repository';

function profile(over: Partial<ServiceProfile> = {}): ServiceProfile {
  return {
    id: 'profile-1',
    user_id: 'user-1',
    role: 'SERVICE_ESTIMATOR',
    trade_specialties: [],
    payout_account_ref: null,
    active: true,
    current_capacity: 0,
    max_concurrent_orders: 5,
    created_at: new Date(0),
    updated_at: new Date(0),
    deleted_at: null,
    ...over,
  } as ServiceProfile;
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('resolvePlatformActor (service-role gate, P3-04/05)', () => {
  it('returns the platform actor for an active service profile', () => {
    expect(resolvePlatformActor(profile())).toEqual({
      userId: 'user-1',
      serviceRole: 'SERVICE_ESTIMATOR',
      serviceProfileId: 'profile-1',
    });
  });

  it('denies a missing or inactive profile (403)', () => {
    expect(code(() => resolvePlatformActor(undefined))).toBe('FORBIDDEN');
    expect(code(() => resolvePlatformActor(profile({ active: false })))).toBe('FORBIDDEN');
  });

  it('enforces the required role, allowing a permitted one', () => {
    // An estimator cannot perform a PLATFORM_ADMIN-only action.
    expect(code(() => resolvePlatformActor(profile(), ['PLATFORM_ADMIN']))).toBe('FORBIDDEN');
    // An admin can.
    expect(
      resolvePlatformActor(profile({ role: 'PLATFORM_ADMIN' }), ['PLATFORM_ADMIN']).serviceRole,
    ).toBe('PLATFORM_ADMIN');
    // A role-restricted route still admits a matching estimator.
    expect(
      resolvePlatformActor(profile(), ['SERVICE_ESTIMATOR', 'PLATFORM_ADMIN']).serviceProfileId,
    ).toBe('profile-1');
  });
});
