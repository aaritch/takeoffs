import type { MeasurementType, Unit } from '@takeoff/contracts';
import {
  applyWaste,
  deriveVolumeCuFt,
  deriveWallSurfaceSqFt,
  toDisplayUnit,
} from '@takeoff/geometry';

/** The factor fields of a condition that drive quantity computation. */
export interface ConditionFactors {
  measurement_type: MeasurementType;
  unit: Unit;
  /** Explicit opt-in to a derivation (AREA→volume, LINEAR→wall surface). Null = no derivation. */
  depth_or_height?: number | null;
  waste_factor_pct: number;
  /** Cost per display unit, integer minor units. Null = no costing. */
  unit_cost_minor?: number | null;
}

export interface ComputedQuantities {
  /** Sum of measurement raw values, in canonical base units (ft / sq ft / cu ft / each). */
  baseQuantity: number;
  /** Base quantity after the waste factor. */
  quantityWithWaste: number;
  /** Quantity-with-waste expressed in the condition's display unit (what is priced/shown). */
  displayQuantity: number;
  /** Derived concrete-style volume (cu ft) — only when an AREA condition has a depth. */
  derivedVolumeCuFt: number | null;
  /** Derived wall surface (sq ft) — only when a LINEAR condition has a height. */
  derivedSurfaceSqFt: number | null;
  /** quantity_with_waste (display unit) × unit_cost_minor, rounded — only when a cost is set. */
  extendedCostMinor: number | null;
}

/**
 * Compute a condition's quantities from a base quantity (the geometry-derived total in base
 * units). Pure — all arithmetic flows through @takeoff/geometry. Derivations are NEVER assumed:
 * a volume/surface result appears only when the matching depth_or_height is explicitly set.
 */
export function computeConditionQuantities(
  c: ConditionFactors,
  baseQuantity: number,
): ComputedQuantities {
  const quantityWithWaste = applyWaste(baseQuantity, c.waste_factor_pct);
  const displayQuantity = toDisplayUnit(quantityWithWaste, c.unit);

  let derivedVolumeCuFt: number | null = null;
  let derivedSurfaceSqFt: number | null = null;
  const depth = c.depth_or_height ?? null;
  if (depth != null && depth > 0) {
    if (c.measurement_type === 'AREA') {
      derivedVolumeCuFt = deriveVolumeCuFt(baseQuantity, depth);
    } else if (c.measurement_type === 'LINEAR') {
      derivedSurfaceSqFt = deriveWallSurfaceSqFt(baseQuantity, depth);
    }
  }

  const extendedCostMinor =
    c.unit_cost_minor != null ? Math.round(c.unit_cost_minor * displayQuantity) : null;

  return {
    baseQuantity,
    quantityWithWaste,
    displayQuantity,
    derivedVolumeCuFt,
    derivedSurfaceSqFt,
    extendedCostMinor,
  };
}
