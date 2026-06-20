import { describe, expect, it } from 'vitest';
import { Viewport } from './viewport';

describe('Viewport', () => {
  it('worldToScreen and screenToWorld are inverses', () => {
    const v = new Viewport(2, 30, -10);
    const world = { x: 100, y: 50 };
    const screen = v.worldToScreen(world);
    expect(screen).toEqual({ x: 230, y: 90 });
    expect(v.screenToWorld(screen)).toEqual(world);
  });

  it('panBy shifts only the translation', () => {
    const v = new Viewport(1.5, 10, 20).panBy(5, -7);
    expect([v.scale, v.tx, v.ty]).toEqual([1.5, 15, 13]);
  });

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const v = new Viewport(1, 0, 0);
    const cursor = { x: 200, y: 120 };
    const worldBefore = v.screenToWorld(cursor);
    const zoomed = v.zoomAt(cursor, 2.5);
    expect(zoomed.scale).toBeCloseTo(2.5);
    const screenAfter = zoomed.worldToScreen(worldBefore);
    expect(screenAfter.x).toBeCloseTo(cursor.x);
    expect(screenAfter.y).toBeCloseTo(cursor.y);
  });

  it('fit centers the content inside the container at the limiting dimension', () => {
    const v = Viewport.fit({ width: 1000, height: 500 }, { width: 800, height: 800 });
    expect(v.scale).toBeCloseTo(0.8); // limited by width: 800/1000
    expect(v.tx).toBeCloseTo(0);
    expect(v.ty).toBeCloseTo((800 - 500 * 0.8) / 2); // vertically centered
  });

  it('clampScale bounds the zoom while keeping the anchor fixed', () => {
    const v = new Viewport(10, 0, 0);
    const clamped = v.clampScale(0.1, 4, { x: 50, y: 50 });
    expect(clamped.scale).toBe(4);
    // anchor point maps to the same world point before and after
    expect(clamped.worldToScreen(v.screenToWorld({ x: 50, y: 50 }))).toEqual({ x: 50, y: 50 });
  });

  it('visibleWorldRect reports the world rectangle on screen', () => {
    const v = Viewport.fit({ width: 100, height: 100 }, { width: 100, height: 100 });
    const r = v.visibleWorldRect({ width: 100, height: 100 });
    expect(r.x).toBeCloseTo(0);
    expect(r.width).toBeCloseTo(100);
  });
});
