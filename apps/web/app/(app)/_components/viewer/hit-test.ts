import type { MeasurementGeometry, Point } from '@takeoff/contracts';
import type { Viewport } from './viewport';

/**
 * Vector hit-testing (P1-07). Picks the measurement nearest a click, testing against the actual
 * geometry (not pixels). Everything is in normalized sheet (world) coordinates — the SAME space
 * the viewer draws in — and the caller passes a tolerance already converted from screen pixels via
 * the viewport scale, so the pickable region is a constant number of screen pixels at every zoom
 * level (the "picks the right one at multiple zoom levels" scenario).
 */

export interface OverlayMeasurement {
  id: string;
  conditionId: string;
  geometry: MeasurementGeometry;
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Ray-casting point-in-polygon (handles a single ring; concave OK). */
function pointInRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function ringEdgeDistance(p: Point, ring: Point[]): number {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    min = Math.min(min, distToSegment(p, ring[j]!, ring[i]!));
  }
  return min;
}

/** Distance from `p` to a geometry — 0 when inside a filled polygon (excluding holes). */
export function pickDistance(p: Point, g: MeasurementGeometry): number {
  switch (g.type) {
    case 'POINT':
      return dist(p, g.point);
    case 'POINT_GROUP':
      return Math.min(...g.points.map((q) => dist(p, q)));
    case 'POLYLINE': {
      let min = Infinity;
      for (let i = 1; i < g.points.length; i++)
        min = Math.min(min, distToSegment(p, g.points[i - 1]!, g.points[i]!));
      return min;
    }
    case 'POLYGON': {
      const inExterior = pointInRing(p, g.exterior);
      const inHole = (g.holes ?? []).some((h) => pointInRing(p, h));
      if (inExterior && !inHole) return 0;
      let edge = ringEdgeDistance(p, g.exterior);
      for (const h of g.holes ?? []) edge = Math.min(edge, ringEdgeDistance(p, h));
      return edge;
    }
  }
}

/** The id of the nearest measurement within `tolerance` of `worldPoint`, or null. Nearest wins. */
export function hitTest(
  measurements: OverlayMeasurement[],
  worldPoint: Point,
  tolerance: number,
): string | null {
  let best: { id: string; d: number } | null = null;
  for (const m of measurements) {
    const d = pickDistance(worldPoint, m.geometry);
    if (d <= tolerance && (!best || d < best.d)) best = { id: m.id, d };
  }
  return best?.id ?? null;
}

/**
 * Pick the measurement under a SCREEN point. Converts to world via the viewport and uses a
 * tolerance of `pickPx` screen pixels (so the target stays the same size at every zoom). This is
 * the selection entry point the overlay component calls on click.
 */
export function pickAtScreen(
  measurements: OverlayMeasurement[],
  screenPoint: Point,
  viewport: Viewport,
  pickPx = 6,
): string | null {
  return hitTest(measurements, viewport.screenToWorld(screenPoint), pickPx / viewport.scale);
}
