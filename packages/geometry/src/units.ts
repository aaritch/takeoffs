import { UNIT_DIMENSION, type QuantityDimension, type Unit } from '@takeoff/contracts';

/**
 * Canonical base unit per dimension (spec §9): LENGTH=foot, AREA=square foot, VOLUME=cubic foot,
 * COUNT=each. Quantities are stored in these base units (full precision) and converted to a
 * condition's display unit only for presentation/export.
 */

/** How many base units make up one of each display unit. */
const BASE_PER_DISPLAY_UNIT: Readonly<Record<Unit, number>> = {
  LF: 1, // foot
  SF: 1, // square foot
  SY: 9, // square yard = 9 sq ft
  CF: 1, // cubic foot
  CY: 27, // cubic yard = 27 cu ft
  EA: 1, // each
};

/** Convert a base-unit value (ft / sqft / cuft / each) to a display unit. */
export function toDisplayUnit(baseValue: number, unit: Unit): number {
  return baseValue / BASE_PER_DISPLAY_UNIT[unit];
}

/** Convert a display-unit value back to the canonical base unit. */
export function fromDisplayUnit(displayValue: number, unit: Unit): number {
  return displayValue * BASE_PER_DISPLAY_UNIT[unit];
}

// --- Derived quantities (must be explicit on a condition; never assumed — spec §6.5) ---

/** Volume (cu ft) from a base area (sq ft) and a height (ft). */
export function deriveVolumeCuFt(areaSqFt: number, heightFt: number): number {
  return areaSqFt * heightFt;
}

/** Wall surface area (sq ft) from a base length (ft) and a height (ft). */
export function deriveWallSurfaceSqFt(lengthFt: number, heightFt: number): number {
  return lengthFt * heightFt;
}

/** Apply a waste factor (percent) to a quantity: qty × (1 + pct/100). */
export function applyWaste(quantity: number, wasteFactorPct: number): number {
  return quantity * (1 + wasteFactorPct / 100);
}

// --- Display rounding (compute in full precision; round only for display/export — spec §9) ---

/** Default decimal places per dimension: lengths 0.1, areas/counts whole, volumes 0.1. */
const DISPLAY_DECIMALS: Readonly<Record<QuantityDimension, number>> = {
  LENGTH: 1,
  AREA: 0,
  VOLUME: 1,
  COUNT: 0,
};

/** Round to a fixed number of decimals (round-half-up). */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Round a display value to the default precision for its unit's dimension. */
export function roundForDisplay(value: number, unit: Unit): number {
  return roundTo(value, DISPLAY_DECIMALS[UNIT_DIMENSION[unit]]);
}
