import { describe, expect, it } from 'vitest';
import {
  addVertex,
  applyOrthoLock,
  canFinish,
  deleteVertex,
  finishDrawing,
  liveQuantity,
  moveVertex,
  startDrawing,
} from './drawing';

describe('ortho-lock', () => {
  it('snaps the segment to horizontal or vertical, whichever is closer', () => {
    expect(applyOrthoLock({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 0 }); // mostly horizontal
    expect(applyOrthoLock({ x: 0, y: 0 }, { x: 3, y: 10 })).toEqual({ x: 0, y: 10 }); // mostly vertical
  });

  it('addVertex applies ortho-lock relative to the previous vertex', () => {
    let s = startDrawing('LINEAR');
    s = addVertex(s, { x: 0, y: 0 });
    s = addVertex(s, { x: 10, y: 2 }, { ortho: true });
    expect(s.vertices[1]).toEqual({ x: 10, y: 0 });
  });
});

describe('vertex editing', () => {
  it('adds, moves, and deletes vertices', () => {
    let s = startDrawing('AREA');
    s = addVertex(s, { x: 0, y: 0 });
    s = addVertex(s, { x: 10, y: 0 });
    s = addVertex(s, { x: 10, y: 10 });
    expect(s.vertices).toHaveLength(3);
    s = moveVertex(s, 1, { x: 20, y: 0 });
    expect(s.vertices[1]).toEqual({ x: 20, y: 0 });
    s = deleteVertex(s, 0);
    expect(s.vertices).toEqual([
      { x: 20, y: 0 },
      { x: 10, y: 10 },
    ]);
  });
});

describe('finishDrawing', () => {
  it('builds a polyline for a LINEAR tool', () => {
    let s = startDrawing('LINEAR');
    s = addVertex(s, { x: 0, y: 0 });
    expect(canFinish(s)).toBe(false);
    s = addVertex(s, { x: 10, y: 0 });
    expect(canFinish(s)).toBe(true);
    const r = finishDrawing(s);
    expect(r).toEqual({ ok: true, geometry: { type: 'POLYLINE', points: s.vertices } });
  });

  it('builds a polygon for AREA and rejects a self-intersecting outline', () => {
    const square = startDrawing('AREA');
    const ok = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ].reduce((st, p) => addVertex(st, p), square);
    expect(finishDrawing(ok)).toMatchObject({ ok: true, geometry: { type: 'POLYGON' } });

    // A bow-tie (self-intersecting) is rejected.
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ].reduce((st, p) => addVertex(st, p), startDrawing('AREA'));
    expect(finishDrawing(bowtie).ok).toBe(false);
  });

  it('builds a single POINT or a POINT_GROUP for COUNT', () => {
    let s = addVertex(startDrawing('COUNT'), { x: 5, y: 5 });
    expect(finishDrawing(s)).toEqual({
      ok: true,
      geometry: { type: 'POINT', point: { x: 5, y: 5 } },
    });
    s = addVertex(s, { x: 7, y: 8 });
    expect(finishDrawing(s)).toMatchObject({ ok: true, geometry: { type: 'POINT_GROUP' } });
  });
});

describe('live readout', () => {
  it('reports length in geometric and (with scale) real units', () => {
    let s = startDrawing('LINEAR');
    s = addVertex(s, { x: 0, y: 0 });
    s = addVertex(s, { x: 100, y: 0 }); // 100 px
    expect(liveQuantity(s).geometric).toBe(100);
    expect(liveQuantity(s, 0.25).real).toBe(25); // 0.25 ft/px → 25 ft
  });

  it('reports area for a closed polygon', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ].reduce((st, p) => addVertex(st, p), startDrawing('AREA'));
    expect(liveQuantity(sq).geometric).toBe(100); // 10×10
    expect(liveQuantity(sq, 0.1).real).toBeCloseTo(1); // 100 px² × 0.1² = 1 sq ft
  });

  it('counts points for the COUNT tool', () => {
    let s = startDrawing('COUNT');
    s = addVertex(s, { x: 1, y: 1 });
    s = addVertex(s, { x: 2, y: 2 });
    expect(liveQuantity(s)).toEqual({ kind: 'count', geometric: 2 });
  });
});
