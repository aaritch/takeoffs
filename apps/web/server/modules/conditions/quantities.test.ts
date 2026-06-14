import { describe, it, expect } from 'vitest';
import { computeConditionQuantities } from './quantities';

describe('computeConditionQuantities', () => {
  it('applies waste and derives volume for an AREA condition with depth', () => {
    const q = computeConditionQuantities(
      { measurement_type: 'AREA', unit: 'SF', depth_or_height: 0.5, waste_factor_pct: 5 },
      2400, // sq ft
    );
    expect(q.quantityWithWaste).toBeCloseTo(2520, 6); // +5%
    expect(q.displayQuantity).toBeCloseTo(2520, 6); // SF factor 1
    expect(q.derivedVolumeCuFt).toBe(1200); // 2400 × 0.5 (from base, pre-waste)
    expect(q.derivedSurfaceSqFt).toBeNull();
  });

  it('derives wall surface for a LINEAR condition with a height', () => {
    const q = computeConditionQuantities(
      { measurement_type: 'LINEAR', unit: 'LF', depth_or_height: 8, waste_factor_pct: 0 },
      100, // ft
    );
    expect(q.derivedSurfaceSqFt).toBe(800);
    expect(q.derivedVolumeCuFt).toBeNull();
  });

  it('never derives without an explicit depth', () => {
    const q = computeConditionQuantities(
      { measurement_type: 'AREA', unit: 'SF', waste_factor_pct: 0 },
      1000,
    );
    expect(q.derivedVolumeCuFt).toBeNull();
    expect(q.derivedSurfaceSqFt).toBeNull();
  });

  it('converts base to the display unit (SY) and computes extended cost', () => {
    const q = computeConditionQuantities(
      { measurement_type: 'AREA', unit: 'SY', waste_factor_pct: 0, unit_cost_minor: 5000 },
      2700, // sq ft = 300 SY
    );
    expect(q.displayQuantity).toBe(300);
    expect(q.extendedCostMinor).toBe(1_500_000); // 300 SY × $50.00
  });

  it('returns null extended cost when no unit cost is set', () => {
    const q = computeConditionQuantities(
      { measurement_type: 'COUNT', unit: 'EA', waste_factor_pct: 0 },
      12,
    );
    expect(q.displayQuantity).toBe(12);
    expect(q.extendedCostMinor).toBeNull();
  });
});
