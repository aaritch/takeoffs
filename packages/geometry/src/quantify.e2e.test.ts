import { describe, it, expect } from 'vitest';
import { polylineLength } from './length';
import { polygonArea } from './area';
import { toRealArea, toRealLength, unitPerPixelFromTwoPoints } from './scale';
import { applyWaste, deriveVolumeCuFt, roundForDisplay, toDisplayUnit } from './units';

// The P1-08 acceptance scenario: a segment calibrated to a known length yields correct lengths
// and areas elsewhere on the sheet — verified against hand calculation, end to end.
describe('end-to-end quantification from a calibrated sheet', () => {
  // Calibrate: a 100px reference segment is 50 ft → 0.5 ft/px.
  const upp = unitPerPixelFromTwoPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 'FEET');

  it('measures a footing (LINEAR → LF)', () => {
    const footing = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
    ]; // 300 px
    const feet = toRealLength(polylineLength(footing), upp); // 300 × 0.5 = 150 ft
    expect(feet).toBe(150);
    expect(roundForDisplay(toDisplayUnit(feet, 'LF'), 'LF')).toBe(150);
  });

  it('measures a slab with a cutout (AREA → SF) and derives concrete volume', () => {
    const slab = {
      exterior: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
      ], // 10000 px²
      holes: [
        [
          { x: 10, y: 10 },
          { x: 10, y: 30 },
          { x: 30, y: 30 },
          { x: 30, y: 10 },
        ],
      ], // 400 px²
    };
    const sqft = toRealArea(polygonArea(slab), upp); // 9600 × 0.25 = 2400 sq ft
    expect(sqft).toBe(2400);

    // 6-inch slab → volume in cubic feet, then cubic yards for display.
    const cuft = deriveVolumeCuFt(sqft, 0.5); // 1200 cu ft
    expect(cuft).toBe(1200);
    expect(roundForDisplay(toDisplayUnit(cuft, 'CY'), 'CY')).toBeCloseTo(44.4, 1); // 1200/27
  });

  it('applies a waste factor to the base quantity', () => {
    const sqft = 2400;
    expect(roundForDisplay(applyWaste(sqft, 5), 'SF')).toBe(2520); // +5%
  });
});
