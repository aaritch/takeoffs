import { describe, expect, it } from 'vitest';
import type { MeasurementGeometry } from '@takeoff/contracts';
import { hitTest, pickAtScreen, pickDistance, type OverlayMeasurement } from './hit-test';
import { Viewport } from './viewport';

const m = (id: string, geometry: MeasurementGeometry): OverlayMeasurement => ({
  id,
  conditionId: 'c1',
  geometry,
});

describe('pickDistance', () => {
  it('measures distance to points, polylines, and polygons', () => {
    expect(pickDistance({ x: 0, y: 0 }, { type: 'POINT', point: { x: 3, y: 4 } })).toBe(5);
    expect(
      pickDistance(
        { x: 5, y: 5 },
        {
          type: 'POLYLINE',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        },
      ),
    ).toBe(5); // perpendicular to the segment
    // inside a square → distance 0; in a hole → not inside
    const square: MeasurementGeometry = {
      type: 'POLYGON',
      exterior: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [
        [
          { x: 4, y: 4 },
          { x: 6, y: 4 },
          { x: 6, y: 6 },
          { x: 4, y: 6 },
        ],
      ],
    };
    expect(pickDistance({ x: 1, y: 1 }, square)).toBe(0); // inside, outside the hole
    expect(pickDistance({ x: 5, y: 5 }, square)).toBeGreaterThan(0); // inside the hole → not filled
    expect(pickDistance({ x: 20, y: 20 }, square)).toBeGreaterThan(9); // well outside
  });
});

describe('hitTest', () => {
  const pointA = m('a', { type: 'POINT', point: { x: 100, y: 100 } });
  const pointB = m('b', { type: 'POINT', point: { x: 108, y: 100 } });

  it('returns null when nothing is within tolerance', () => {
    expect(hitTest([pointA], { x: 100, y: 130 }, 5)).toBeNull();
  });

  it('picks the nearest object when several are close together', () => {
    // Click at x=103 → closer to A(100) than B(108).
    expect(hitTest([pointA, pointB], { x: 103, y: 100 }, 10)).toBe('a');
    // Click at x=106 → closer to B.
    expect(hitTest([pointA, pointB], { x: 106, y: 100 }, 10)).toBe('b');
  });

  it('respects a zoom-scaled tolerance (smaller tolerance when zoomed out)', () => {
    const click = { x: 100, y: 106 };
    expect(hitTest([pointA], click, 8)).toBe('a'); // generous tolerance hits
    expect(hitTest([pointA], click, 4)).toBeNull(); // tight tolerance misses (further zoomed out)
  });

  it('selects a polygon by clicking inside it', () => {
    const poly = m('area', {
      type: 'POLYGON',
      exterior: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ],
    });
    expect(hitTest([poly], { x: 25, y: 25 }, 1)).toBe('area');
    expect(hitTest([poly], { x: 75, y: 75 }, 1)).toBeNull();
  });
});

describe('pickAtScreen (viewport-aware selection)', () => {
  const point = m('p', { type: 'POINT', point: { x: 100, y: 100 } });

  it('keeps a constant screen-pixel target across zoom levels', () => {
    // Zoomed in 4×: the world point sits at screen (400,400). A click 5px away hits (5px < 6px).
    const zin = new Viewport(4, 0, 0);
    expect(pickAtScreen([point], { x: 405, y: 400 }, zin, 6)).toBe('p');
    // Zoomed out 0.25×: world point at screen (25,25). A click 5px away still hits (same 6px target).
    const zout = new Viewport(0.25, 0, 0);
    expect(pickAtScreen([point], { x: 30, y: 25 }, zout, 6)).toBe('p');
    // 10px away exceeds the 6px target at any zoom.
    expect(pickAtScreen([point], { x: 410, y: 400 }, zin, 6)).toBeNull();
  });
});
