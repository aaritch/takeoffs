import type { Point, Polygon } from './types';

/**
 * Signed area of a ring via the shoelace formula. Positive for counter-clockwise, negative for
 * clockwise (in a y-down sheet space the sign convention is consistent; only magnitude is used
 * for quantities). Treats the ring as closed regardless of whether the last vertex repeats.
 */
export function ringSignedArea(ring: Point[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Absolute area of a single ring. */
export function ringArea(ring: Point[]): number {
  return Math.abs(ringSignedArea(ring));
}

/**
 * Area of a polygon: the outer ring minus every interior ring (holes/cutouts) — spec §9. Holes
 * are clamped at the outer area floor of zero so malformed input can never yield a negative area.
 */
export function polygonArea(polygon: Polygon): number {
  const outer = ringArea(polygon.exterior);
  const holes = (polygon.holes ?? []).reduce((sum, ring) => sum + ringArea(ring), 0);
  return Math.max(0, outer - holes);
}

// --- Self-intersection (validity) -------------------------------------------------

function orientation(p: Point, q: Point, r: Point): number {
  const v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    Math.min(p.x, r.x) <= q.x &&
    q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y &&
    q.y <= Math.max(p.y, r.y)
  );
}

/** Whether closed segments p1p2 and p3p4 intersect (including collinear overlap). */
export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

/**
 * A simple polygon's edges meet only at shared vertices (no crossing, no non-adjacent touching).
 * Area conditions MUST reject self-intersecting polygons so a quantity is never ambiguous
 * (spec §9 / P1-09 caveat). The exact policy (reject vs auto-correct) is a TBD decision; this
 * predicate is the detector either way. O(n²) — fine for hand-drawn rings.
 */
export function isSimplePolygon(ring: Point[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i]!;
    const a2 = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // Skip the two edges adjacent to edge i (they legitimately share a vertex).
      if (j === i) continue;
      const adjacent = j === (i + 1) % n || (j + 1) % n === i;
      if (adjacent) continue;
      const b1 = ring[j]!;
      const b2 = ring[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}
