import { describe, expect, it } from 'vitest';
import {
  isEligible,
  pickEstimator,
  specialtiesMatch,
  type EstimatorCandidate,
} from './eligibility';

function cand(over: Partial<EstimatorCandidate> = {}): EstimatorCandidate {
  return {
    profileId: 'p',
    specialties: ['t1'],
    active: true,
    currentLoad: 0,
    maxConcurrent: 5,
    ...over,
  };
}

describe('estimator eligibility (P3-04)', () => {
  it('specialtiesMatch needs an overlap, but no requested trades matches anyone', () => {
    expect(specialtiesMatch(['t1', 't2'], ['t2'])).toBe(true);
    expect(specialtiesMatch(['t1'], ['t9'])).toBe(false);
    expect(specialtiesMatch([], ['t1'])).toBe(false);
    expect(specialtiesMatch(['t1'], [])).toBe(true);
  });

  it('isEligible requires active, under-capacity, and a specialty match', () => {
    expect(isEligible(cand(), ['t1'])).toBe(true);
    expect(isEligible(cand({ active: false }), ['t1'])).toBe(false);
    expect(isEligible(cand({ currentLoad: 5, maxConcurrent: 5 }), ['t1'])).toBe(false);
    expect(isEligible(cand({ specialties: ['x'] }), ['t1'])).toBe(false);
  });

  it('pickEstimator chooses the least-loaded eligible estimator, or null when none', () => {
    const a = cand({ profileId: 'a', currentLoad: 2 });
    const b = cand({ profileId: 'b', currentLoad: 1 });
    const full = cand({ profileId: 'c', currentLoad: 5, maxConcurrent: 5 });
    expect(pickEstimator([a, b, full], ['t1'])?.profileId).toBe('b'); // least loaded
    expect(pickEstimator([full], ['t1'])).toBeNull(); // none eligible → order waits
    expect(pickEstimator([], ['t1'])).toBeNull();
  });
});
