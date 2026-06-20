import { Viewport, type Size } from './viewport';

/**
 * Deep Zoom (DZI) tile math (P1-06) — matching what the worker writes (P1-03,
 * `@takeoff/contracts/tiles`): square tiles, fixed overlap, resolution halving per level. Pure
 * functions so tile selection is testable without a canvas. Keep these conventions identical to
 * the producer or overlays misalign (the GATE caveat).
 */

export interface DziInfo {
  /** Full-resolution sheet size, in world pixels. */
  width: number;
  height: number;
  tileSize: number;
  overlap: number;
}

/** Highest (full-resolution) DZI level. Level 0 is a 1×1 image. */
export function maxLevel(d: DziInfo): number {
  return Math.ceil(Math.log2(Math.max(d.width, d.height, 1)));
}

/** Pixel dimensions of the image at `level`. */
export function levelSize(d: DziInfo, level: number): Size {
  const f = Math.pow(0.5, maxLevel(d) - level);
  return {
    width: Math.max(1, Math.ceil(d.width * f)),
    height: Math.max(1, Math.ceil(d.height * f)),
  };
}

/** World (full-res) pixels per 1 pixel at `level`. */
export function worldPerLevelPx(d: DziInfo, level: number): number {
  return Math.pow(2, maxLevel(d) - level);
}

/**
 * The level whose resolution best matches the on-screen density. `screenScale` = screen px per
 * world (full-res) px. Rounds up so the image is never upscaled/blurry; the overview level is
 * loaded separately for instant first paint.
 */
export function bestLevel(d: DziInfo, screenScale: number): number {
  const ideal = maxLevel(d) + Math.log2(Math.max(screenScale, 1e-9));
  return Math.max(0, Math.min(maxLevel(d), Math.ceil(ideal)));
}

/** The lowest level that fits the whole sheet in a single tile — load this first (instant paint). */
export function overviewLevel(d: DziInfo): number {
  const span = Math.max(d.width, d.height) / d.tileSize;
  return Math.max(0, maxLevel(d) - Math.ceil(Math.log2(Math.max(span, 1))));
}

export interface VisibleTile {
  level: number;
  col: number;
  row: number;
  /** World-space top-left of this tile's (overlap-clamped) position. */
  worldX: number;
  worldY: number;
}

/** Tiles of `level` intersecting the viewport over a `container`, row-major. */
export function visibleTiles(
  d: DziInfo,
  level: number,
  viewport: Viewport,
  container: Size,
): VisibleTile[] {
  const size = levelSize(d, level);
  const cols = Math.max(1, Math.ceil(size.width / d.tileSize));
  const rows = Math.max(1, Math.ceil(size.height / d.tileSize));
  const wpl = worldPerLevelPx(d, level);

  const vis = viewport.visibleWorldRect(container);
  const c0 = Math.max(0, Math.floor(vis.x / wpl / d.tileSize));
  const c1 = Math.min(cols - 1, Math.floor((vis.x + vis.width) / wpl / d.tileSize));
  const r0 = Math.max(0, Math.floor(vis.y / wpl / d.tileSize));
  const r1 = Math.min(rows - 1, Math.floor((vis.y + vis.height) / wpl / d.tileSize));

  const tiles: VisibleTile[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      // DeepZoom: a tile carries `overlap` extra px on each side that has a neighbor, so an
      // interior tile's top-left shifts back by `overlap`.
      const posX = Math.max(0, col * d.tileSize - (col > 0 ? d.overlap : 0));
      const posY = Math.max(0, row * d.tileSize - (row > 0 ? d.overlap : 0));
      tiles.push({ level, col, row, worldX: posX * wpl, worldY: posY * wpl });
    }
  }
  return tiles;
}
