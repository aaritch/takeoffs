import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG } from './catalog';
import { deriveOrgEntitlements } from './entitlements';

describe('deriveOrgEntitlements (pure, P4-01)', () => {
  it('ACTIVE and TRIALING grant the paid tier with an ACTIVE account', () => {
    expect(deriveOrgEntitlements('ACTIVE', 'PRO')).toEqual({
      planTier: 'PRO',
      seatLimit: PLAN_CATALOG.PRO.seatLimit,
      orgStatus: 'ACTIVE',
    });
    expect(deriveOrgEntitlements('TRIALING', 'STARTER')).toEqual({
      planTier: 'STARTER',
      seatLimit: PLAN_CATALOG.STARTER.seatLimit,
      orgStatus: 'ACTIVE',
    });
  });

  it('PAST_DUE keeps the tier but restricts the account to PAST_DUE', () => {
    expect(deriveOrgEntitlements('PAST_DUE', 'PRO')).toEqual({
      planTier: 'PRO',
      seatLimit: PLAN_CATALOG.PRO.seatLimit,
      orgStatus: 'PAST_DUE',
    });
  });

  it('PAUSED suspends the account, keeping the tier', () => {
    expect(deriveOrgEntitlements('PAUSED', 'PRO')).toMatchObject({
      orgStatus: 'SUSPENDED',
      planTier: 'PRO',
    });
  });

  it('CANCELED and INCOMPLETE drop the org to FREE / ACTIVE', () => {
    const free = { planTier: 'FREE', seatLimit: PLAN_CATALOG.FREE.seatLimit, orgStatus: 'ACTIVE' };
    expect(deriveOrgEntitlements('CANCELED', 'PRO')).toEqual(free);
    expect(deriveOrgEntitlements('INCOMPLETE', 'PRO')).toEqual(free);
  });

  it('the catalog grants more seats the higher the tier', () => {
    expect(PLAN_CATALOG.FREE.seatLimit).toBeLessThan(PLAN_CATALOG.STARTER.seatLimit);
    expect(PLAN_CATALOG.STARTER.seatLimit).toBeLessThan(PLAN_CATALOG.PRO.seatLimit);
  });
});
