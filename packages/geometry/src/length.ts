import type { Point, Polyline } from './types';

/** Euclidean distance between two points in normalized sheet coordinates. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Total geometric length of a polyline (sum of all segments). 0 for <2 points. */
export function polylineLength(points: Polyline): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1]!, points[i]!);
  }
  return total;
}
