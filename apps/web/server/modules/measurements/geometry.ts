import type { MeasurementGeometry } from '@takeoff/contracts';
import { polygonArea, polylineLength, toRealArea, toRealLength } from '@takeoff/geometry';

/**
 * The SERVER-authoritative real-world quantity (canonical base units) for a measurement,
 * computed from its geometry and the sheet's scale. This is the only path to a measurement's
 * value — the client supplies geometry, never a total — so quantities cannot be tampered with.
 */
export function computeRawValue(geometry: MeasurementGeometry, unitPerPixel: number): number {
  switch (geometry.type) {
    case 'POLYLINE':
      return toRealLength(polylineLength(geometry.points), unitPerPixel);
    case 'POLYGON':
      return toRealArea(
        polygonArea({
          exterior: geometry.exterior,
          ...(geometry.holes ? { holes: geometry.holes } : {}),
        }),
        unitPerPixel,
      );
    case 'POINT':
      return 1;
    case 'POINT_GROUP':
      return geometry.points.length;
  }
}
