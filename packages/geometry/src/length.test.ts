import { describe, it, expect } from 'vitest';
import { distance, polylineLength } from './length';

describe('distance', () => {
  it('computes a 3-4-5 distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('is zero for identical points', () => {
    expect(distance({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });
});

describe('polylineLength', () => {
  it('sums the segments', () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
      ]),
    ).toBe(20);
  });
  it('is zero for fewer than two points', () => {
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([{ x: 1, y: 1 }])).toBe(0);
  });
});
