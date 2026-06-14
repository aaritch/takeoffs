import type { Point } from './types';
import { distance } from './length';

/**
 * The scale model (spec §9): `unit_per_pixel` converts normalized distance to real-world
 * distance. It is always expressed in the canonical base length unit — FEET per normalized
 * pixel — regardless of which unit the user calibrated in. Length = geometricLength × upp;
 * Area = geometricArea × upp². The AI pipeline and the manual tools MUST use this identical
 * conversion.
 */

/** Units a user may calibrate a reference segment in. Converted to canonical feet. */
export type LengthInputUnit = 'FEET' | 'INCHES' | 'YARDS' | 'METERS';

const FEET_PER_INPUT_UNIT: Readonly<Record<LengthInputUnit, number>> = {
  FEET: 1,
  INCHES: 1 / 12,
  YARDS: 3,
  METERS: 3.280839895013123,
};

/** Convert a real-world length in any supported input unit to canonical feet. */
export function lengthToFeet(value: number, unit: LengthInputUnit): number {
  return value * FEET_PER_INPUT_UNIT[unit];
}

/**
 * Two-point manual calibration (P1-08): given the two reference points and the real-world
 * length of the segment between them, compute `unit_per_pixel` in FEET per normalized pixel.
 * Throws on a degenerate (zero-length) reference segment.
 */
export function unitPerPixelFromTwoPoints(
  a: Point,
  b: Point,
  realLength: number,
  unit: LengthInputUnit = 'FEET',
): number {
  const px = distance(a, b);
  if (px === 0) {
    throw new Error('Calibration segment has zero length');
  }
  if (!(realLength > 0)) {
    throw new Error('Calibration length must be positive');
  }
  return lengthToFeet(realLength, unit) / px;
}

/** Real-world length (feet) from a geometric length and the sheet's unit_per_pixel. */
export function toRealLength(geometricLength: number, unitPerPixel: number): number {
  return geometricLength * unitPerPixel;
}

/** Real-world area (square feet) from a geometric area and the sheet's unit_per_pixel. */
export function toRealArea(geometricArea: number, unitPerPixel: number): number {
  return geometricArea * unitPerPixel * unitPerPixel;
}
