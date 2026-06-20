import type { MeasurementGeometry, Point } from '@takeoff/contracts';
import {
  isSimplePolygon,
  polygonArea,
  polylineLength,
  toRealArea,
  toRealLength,
} from '@takeoff/geometry';

/**
 * Manual measurement tool logic (P1-09) — pure and exhaustively tested, so drawing/editing and the
 * live readout are correct independent of the canvas. Vertices are in normalized sheet (world)
 * coordinates (the only thing ever stored); the component converts screen↔world via the shared
 * viewport. Real-world readouts come from the geometry package's scale math.
 *
 * Self-intersecting AREA polygons are REJECTED (the STATE §7 TBD, decided): an ambiguous area is
 * worse than making the user fix the outline.
 */

export type ToolKind = 'LINEAR' | 'AREA' | 'COUNT';

export interface DrawingState {
  tool: ToolKind;
  vertices: Point[];
}

export function startDrawing(tool: ToolKind): DrawingState {
  return { tool, vertices: [] };
}

/** Constrain `candidate` so the segment from `prev` is axis-aligned (nearest of horizontal/vertical). */
export function applyOrthoLock(prev: Point, candidate: Point): Point {
  return Math.abs(candidate.x - prev.x) >= Math.abs(candidate.y - prev.y)
    ? { x: candidate.x, y: prev.y }
    : { x: prev.x, y: candidate.y };
}

export function addVertex(
  state: DrawingState,
  point: Point,
  opts: { ortho?: boolean } = {},
): DrawingState {
  const last = state.vertices[state.vertices.length - 1];
  const p = opts.ortho && last ? applyOrthoLock(last, point) : point;
  return { ...state, vertices: [...state.vertices, p] };
}

export function moveVertex(state: DrawingState, index: number, point: Point): DrawingState {
  if (index < 0 || index >= state.vertices.length) return state;
  const vertices = state.vertices.slice();
  vertices[index] = point;
  return { ...state, vertices };
}

export function deleteVertex(state: DrawingState, index: number): DrawingState {
  return { ...state, vertices: state.vertices.filter((_, i) => i !== index) };
}

const MIN_VERTICES: Record<ToolKind, number> = { LINEAR: 2, AREA: 3, COUNT: 1 };

export function canFinish(state: DrawingState): boolean {
  return state.vertices.length >= MIN_VERTICES[state.tool];
}

export type FinishResult =
  | { ok: true; geometry: MeasurementGeometry }
  | { ok: false; reason: string };

/** Turn the in-progress vertices into a measurement geometry, or explain why it isn't valid yet. */
export function finishDrawing(state: DrawingState): FinishResult {
  const { tool, vertices } = state;
  if (vertices.length < MIN_VERTICES[tool]) {
    return {
      ok: false,
      reason: `Need at least ${MIN_VERTICES[tool]} point(s) for a ${tool} measurement`,
    };
  }
  switch (tool) {
    case 'LINEAR':
      return { ok: true, geometry: { type: 'POLYLINE', points: vertices } };
    case 'AREA':
      if (!isSimplePolygon(vertices)) {
        return {
          ok: false,
          reason: 'The outline crosses itself — fix it so the area is unambiguous',
        };
      }
      return { ok: true, geometry: { type: 'POLYGON', exterior: vertices } };
    case 'COUNT':
      return {
        ok: true,
        geometry:
          vertices.length === 1
            ? { type: 'POINT', point: vertices[0]! }
            : { type: 'POINT_GROUP', points: vertices },
      };
  }
}

export interface LiveQuantity {
  kind: 'length' | 'area' | 'count';
  /** Value in normalized (geometric) units. */
  geometric: number;
  /** Real-world value (feet / sq ft), when a sheet scale is known. */
  real?: number;
}

/** Live length/area/count readout for the in-progress drawing. */
export function liveQuantity(state: DrawingState, unitPerPixel?: number): LiveQuantity {
  switch (state.tool) {
    case 'LINEAR': {
      const geometric = polylineLength(state.vertices);
      return {
        kind: 'length',
        geometric,
        ...(unitPerPixel ? { real: toRealLength(geometric, unitPerPixel) } : {}),
      };
    }
    case 'AREA': {
      const geometric = state.vertices.length >= 3 ? polygonArea({ exterior: state.vertices }) : 0;
      return {
        kind: 'area',
        geometric,
        ...(unitPerPixel ? { real: toRealArea(geometric, unitPerPixel) } : {}),
      };
    }
    case 'COUNT':
      return { kind: 'count', geometric: state.vertices.length };
  }
}
