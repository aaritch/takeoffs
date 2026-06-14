import { describe, it, expect } from 'vitest';
import { lengthToFeet, toRealArea, toRealLength, unitPerPixelFromTwoPoints } from './scale';

describe('lengthToFeet', () => {
  it('converts input units to canonical feet', () => {
    expect(lengthToFeet(10, 'FEET')).toBe(10);
    expect(lengthToFeet(24, 'INCHES')).toBe(2);
    expect(lengthToFeet(2, 'YARDS')).toBe(6);
    expect(lengthToFeet(1, 'METERS')).toBeCloseTo(3.280839895, 6);
  });
});

describe('unitPerPixelFromTwoPoints', () => {
  it('computes feet-per-pixel from a calibrated segment', () => {
    const upp = unitPerPixelFromTwoPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 'FEET');
    expect(upp).toBe(0.5);
  });
  it('converts a metric calibration to feet/pixel', () => {
    const upp = unitPerPixelFromTwoPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 'METERS');
    expect(upp).toBeCloseTo(0.328083989, 6);
  });
  it('rejects a zero-length or non-positive calibration', () => {
    expect(() => unitPerPixelFromTwoPoints({ x: 0, y: 0 }, { x: 0, y: 0 }, 50)).toThrow();
    expect(() => unitPerPixelFromTwoPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toThrow();
  });
});

describe('applying scale', () => {
  it('length scales linearly; area scales with the square', () => {
    const upp = 0.5; // ft per pixel
    expect(toRealLength(200, upp)).toBe(100); // 200 px → 100 ft
    expect(toRealArea(10000, upp)).toBe(2500); // 100×100 px → 2500 sq ft
  });
});
