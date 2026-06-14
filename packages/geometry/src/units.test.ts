import { describe, it, expect } from 'vitest';
import {
  applyWaste,
  deriveVolumeCuFt,
  deriveWallSurfaceSqFt,
  fromDisplayUnit,
  roundForDisplay,
  roundTo,
  toDisplayUnit,
} from './units';

describe('display unit conversion', () => {
  it('passes through base-aligned units and scales the others', () => {
    expect(toDisplayUnit(100, 'LF')).toBe(100);
    expect(toDisplayUnit(2700, 'SF')).toBe(2700);
    expect(toDisplayUnit(2700, 'SY')).toBe(300); // 2700 sq ft ÷ 9
    expect(toDisplayUnit(270, 'CY')).toBe(10); // 270 cu ft ÷ 27
  });
  it('round-trips base ↔ display', () => {
    expect(fromDisplayUnit(toDisplayUnit(2700, 'SY'), 'SY')).toBe(2700);
    expect(fromDisplayUnit(10, 'CY')).toBe(270);
  });
});

describe('derived quantities and waste', () => {
  it('derives volume and wall surface', () => {
    expect(deriveVolumeCuFt(2500, 0.5)).toBe(1250);
    expect(deriveWallSurfaceSqFt(100, 8)).toBe(800);
  });
  it('applies a waste factor', () => {
    expect(applyWaste(100, 10)).toBeCloseTo(110, 9);
    expect(applyWaste(100, 0)).toBe(100);
  });
});

describe('rounding', () => {
  it('rounds to fixed decimals', () => {
    expect(roundTo(123.456, 1)).toBe(123.5);
    expect(roundTo(2.5, 0)).toBe(3);
  });
  it('uses per-dimension display precision', () => {
    expect(roundForDisplay(123.456, 'LF')).toBe(123.5); // length → 1 dp
    expect(roundForDisplay(2500.7, 'SF')).toBe(2501); // area → whole
    expect(roundForDisplay(3.49, 'EA')).toBe(3); // count → whole
    expect(roundForDisplay(12.34, 'CY')).toBe(12.3); // volume → 1 dp
  });
});
