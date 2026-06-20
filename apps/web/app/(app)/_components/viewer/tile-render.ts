import { Viewport, type Size } from './viewport';
import { bestLevel, overviewLevel, visibleTiles, worldPerLevelPx, type DziInfo } from './dzi';
import { TILE_OVERLAP, TILE_SIZE } from '@takeoff/contracts';

/**
 * Shared tile-drawing routine (P1-06/07). Paints the overview level under the best level for the
 * current zoom, requesting only visible tiles and caching loaded images. Used by both the
 * standalone viewer and the layered viewer (so the overlay shares the exact same pixel mapping).
 */

export interface TileDrawParams {
  sheet: { widthPx: number; heightPx: number };
  viewport: Viewport;
  container: Size;
  dpr: number;
  cache: Map<string, HTMLImageElement>;
  tileUrl: (level: number, col: number, row: number) => string;
  /** Called when a tile finishes loading, so the caller can request a repaint. */
  onTileLoad: () => void;
}

export function drawTiles(canvas: HTMLCanvasElement, p: TileDrawParams): void {
  const { viewport: vp, container: box, dpr } = p;
  if (box.width === 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);

  const dzi: DziInfo = {
    width: p.sheet.widthPx,
    height: p.sheet.heightPx,
    tileSize: TILE_SIZE,
    overlap: TILE_OVERLAP,
  };

  const getTile = (level: number, col: number, row: number): HTMLImageElement | null => {
    const key = `${level}/${col}_${row}`;
    const cached = p.cache.get(key);
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
    const img = new Image();
    p.cache.set(key, img);
    img.onload = () => p.onTileLoad();
    img.onerror = () => p.cache.delete(key);
    img.src = p.tileUrl(level, col, row);
    return null;
  };

  const best = bestLevel(dzi, vp.scale);
  const levels = best === overviewLevel(dzi) ? [best] : [overviewLevel(dzi), best];
  for (const level of levels) {
    const wpl = worldPerLevelPx(dzi, level);
    for (const t of visibleTiles(dzi, level, vp, box)) {
      const img = getTile(t.level, t.col, t.row);
      if (!img) continue;
      const s = vp.worldToScreen({ x: t.worldX, y: t.worldY });
      ctx.drawImage(
        img,
        s.x,
        s.y,
        img.naturalWidth * wpl * vp.scale,
        img.naturalHeight * wpl * vp.scale,
      );
    }
  }
}
