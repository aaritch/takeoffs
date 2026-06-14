import { describe, it, expect } from 'vitest';
import { computeRawValue } from './geometry';

describe('computeRawValue', () => {
  it('converts a polyline to real length', () => {
    expect(
      computeRawValue(
        {
          type: 'POLYLINE',
          points: [
            { x: 0, y: 0 },
            { x: 0, y: 200 },
          ],
        },
        0.5,
      ),
    ).toBe(100); // 200 px × 0.5 ft/px
  });

  it('converts a polygon to real area (minus holes)', () => {
    const square = (s: number) => [
      { x: 0, y: 0 },
      { x: 0, y: s },
      { x: s, y: s },
      { x: s, y: 0 },
    ];
    expect(computeRawValue({ type: 'POLYGON', exterior: square(100) }, 0.5)).toBe(2500); // 10000 px² × 0.25
    expect(
      computeRawValue({ type: 'POLYGON', exterior: square(100), holes: [square(20)] }, 0.5),
    ).toBe(2400); // (10000 − 400) × 0.25
  });

  it('counts points', () => {
    expect(computeRawValue({ type: 'POINT', point: { x: 1, y: 1 } }, 1)).toBe(1);
    expect(
      computeRawValue(
        {
          type: 'POINT_GROUP',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
        1,
      ),
    ).toBe(3);
  });
});
