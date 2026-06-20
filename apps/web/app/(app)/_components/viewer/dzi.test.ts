import { describe, expect, it } from 'vitest';
import {
  bestLevel,
  levelSize,
  maxLevel,
  overviewLevel,
  visibleTiles,
  worldPerLevelPx,
} from './dzi';
import { Viewport } from './viewport';

// A sheet rendered at 150 DPI from a US-Letter page (matches P1-03's tiler output).
const sheet = { width: 1275, height: 1650, tileSize: 256, overlap: 1 };

describe('DZI math', () => {
  it('computes the max level and per-level sizes', () => {
    const max = maxLevel(sheet);
    expect(max).toBe(11); // ceil(log2(1650))
    expect(levelSize(sheet, max)).toEqual({ width: 1275, height: 1650 }); // full res
    expect(levelSize(sheet, 0)).toEqual({ width: 1, height: 1 }); // 1×1
    expect(worldPerLevelPx(sheet, max)).toBe(1);
    expect(worldPerLevelPx(sheet, max - 1)).toBe(2);
  });

  it('picks a coarser level when zoomed out and full res when 1:1', () => {
    const max = maxLevel(sheet);
    expect(bestLevel(sheet, 1)).toBe(max); // 1 screen px per world px → full res
    expect(bestLevel(sheet, 0.5)).toBe(max - 1); // half density → one level down
    expect(bestLevel(sheet, 0.25)).toBe(max - 2);
    expect(bestLevel(sheet, 1e-6)).toBe(0); // extremely zoomed out clamps to overview
  });

  it('overview level fits the whole sheet in a single tile', () => {
    const lvl = overviewLevel(sheet);
    const size = levelSize(sheet, lvl);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(sheet.tileSize);
  });

  it('returns only the tiles intersecting the viewport', () => {
    const max = maxLevel(sheet);
    const container = { width: 1000, height: 800 };

    // Zoomed in to 1:1 at full-res level, viewport at the origin → top-left tiles only.
    const v = new Viewport(1, 0, 0);
    const tiles = visibleTiles(sheet, max, v, container);
    expect(tiles.length).toBeGreaterThan(0);
    // every returned tile is within the level's grid and intersects [0,1000]×[0,800]
    const cols = Math.ceil(1275 / 256); // 5
    expect(tiles.every((t) => t.col >= 0 && t.col < cols && t.row >= 0)).toBe(true);
    expect(tiles.some((t) => t.col === 0 && t.row === 0)).toBe(true);
    // a tile far to the right (col 4 starts at x=1024 > 1000) is NOT visible
    expect(tiles.some((t) => t.col === 4)).toBe(false);
  });

  it('a fully off-screen region yields no tiles (nothing to fetch)', () => {
    const v = new Viewport(1, -100000, -100000); // image pushed far off-screen
    expect(visibleTiles(sheet, maxLevel(sheet), v, { width: 800, height: 600 })).toEqual([]);
  });
});
