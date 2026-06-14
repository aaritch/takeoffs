/**
 * Geometry is stored and computed in NORMALIZED SHEET COORDINATES (spec §9): an origin at the
 * sheet's top-left and a fixed virtual resolution independent of raster DPI. Real-world values
 * are derived only through the sheet scale (see scale.ts). Nothing here knows about pixels on a
 * screen — the viewer maps these to the display via its viewport transform.
 */
export interface Point {
  x: number;
  y: number;
}

/** An ordered list of vertices. A polyline's length is the sum of its segments. */
export type Polyline = Point[];

/**
 * A polygon with an outer ring and zero or more interior rings (holes/cutouts). Rings may be
 * given open (first vertex not repeated) or closed; the math treats them as closed loops.
 */
export interface Polygon {
  exterior: Point[];
  holes?: Point[][];
}
