import { describe, expect, it } from 'vitest';
import { nonRegresses } from './non-regression';

describe('nonRegresses (P4-06 benchmark gate)', () => {
  it('passes when the candidate improves every tracked metric', () => {
    const r = nonRegresses({ precision: 0.92, recall: 0.9 }, { precision: 0.9, recall: 0.88 });
    expect(r.ok).toBe(true);
    expect(r.regressions).toEqual([]);
  });

  it('passes when the candidate exactly ties every metric', () => {
    const r = nonRegresses({ precision: 0.9 }, { precision: 0.9 });
    expect(r.ok).toBe(true);
  });

  it('blocks when any single tracked metric regresses', () => {
    const r = nonRegresses(
      { precision: 0.95, 'wall.recall': 0.7 },
      { precision: 0.9, 'wall.recall': 0.8 },
    );
    expect(r.ok).toBe(false);
    expect(r.regressions).toHaveLength(1);
    expect(r.regressions[0]).toMatchObject({ metric: 'wall.recall', active: 0.8, candidate: 0.7 });
  });

  it('treats a missing tracked metric as a regression (cannot promote unmeasured)', () => {
    const r = nonRegresses({ precision: 0.95 }, { precision: 0.9, recall: 0.8 });
    expect(r.ok).toBe(false);
    expect(r.regressions).toEqual([
      { metric: 'recall', active: 0.8, candidate: null, delta: null },
    ]);
  });

  it('ignores extra candidate-only metrics (the ACTIVE set defines what is tracked)', () => {
    const r = nonRegresses({ precision: 0.9, f1: 0.85 }, { precision: 0.9 });
    expect(r.ok).toBe(true);
  });

  it('allows a within-tolerance dip but blocks beyond it', () => {
    expect(nonRegresses({ p: 0.89 }, { p: 0.9 }, 0.02).ok).toBe(true);
    expect(nonRegresses({ p: 0.87 }, { p: 0.9 }, 0.02).ok).toBe(false);
  });

  it('promotes unconditionally against an empty incumbent metric set', () => {
    expect(nonRegresses({ precision: 0.9 }, {}).ok).toBe(true);
  });

  it('reports the delta on a regression', () => {
    const r = nonRegresses({ p: 0.8 }, { p: 0.9 });
    expect(r.regressions[0]!.delta).toBeCloseTo(-0.1, 10);
  });
});
