import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG } from './catalog';
import { billingPeriod, metricLimit, quotaDecision } from './quota';

describe('quotaDecision (pure, P4-02)', () => {
  it('allows under the limit and reports remaining', () => {
    expect(quotaDecision(2, 5, 'BLOCK')).toEqual({
      outcome: 'ALLOW',
      overQuota: false,
      remaining: 3,
    });
  });

  it('treats a negative limit as unlimited — always allowed', () => {
    expect(quotaDecision(1000, -1, 'BLOCK')).toEqual({
      outcome: 'ALLOW',
      overQuota: false,
      remaining: -1,
    });
  });

  it('at the limit, the policy decides the outcome', () => {
    expect(quotaDecision(5, 5, 'BLOCK')).toMatchObject({ outcome: 'BLOCK', overQuota: true });
    expect(quotaDecision(5, 5, 'WARN')).toMatchObject({ outcome: 'WARN', overQuota: true });
    expect(quotaDecision(5, 5, 'OVERAGE')).toMatchObject({
      outcome: 'ALLOW_OVERAGE',
      overQuota: true,
    });
  });

  it('a zero limit blocks the very first event', () => {
    expect(quotaDecision(0, 0, 'BLOCK').outcome).toBe('BLOCK');
  });
});

describe('metricLimit + billingPeriod (pure, P4-02)', () => {
  it('maps each metric to its plan entitlement; managed orders are unlimited', () => {
    const pro = PLAN_CATALOG.PRO;
    expect(metricLimit(pro, 'AI_TAKEOFF_RUN')).toBe(pro.aiTakeoffRunsPerMonth);
    expect(metricLimit(pro, 'EXPORT')).toBe(pro.exportsPerMonth);
    expect(metricLimit(pro, 'MANAGED_ORDER')).toBe(-1);
    expect(metricLimit(PLAN_CATALOG.FREE, 'AI_TAKEOFF_RUN')).toBe(0); // FREE excludes AI runs
  });

  it('derives the YYYY-MM UTC billing window', () => {
    expect(billingPeriod(new Date('2026-03-09T23:00:00Z'))).toBe('2026-03');
    expect(billingPeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});
