'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TILE_OVERLAP, TILE_SIZE } from '@takeoff/contracts';
import { Viewport, type Size } from './viewport';
import { bestLevel, overviewLevel, visibleTiles, worldPerLevelPx, type DziInfo } from './dzi';

/**
 * Deep-zoom tile viewer (P1-06). Pans/zooms against the DZI pyramid, requesting only the tiles
 * visible at the current level and painting the overview level underneath for instant first paint.
 * The viewport transform is the same one the overlay layer (P1-07) will share. Loaded tiles are
 * cached, so a fast pan/zoom dedupes requests instead of flooding the network.
 *
 * NOTE (GATE): smoothness/first-paint budget must be validated on representative hardware — that
 * can't be measured headlessly. Aborting still-in-flight offscreen tile loads is a refinement.
 */

export interface ViewerSheet {
  id: string;
  widthPx: number;
  heightPx: number;
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 8;

export function TileViewer({
  sheet,
  tileUrl: tileUrlProp,
}: {
  sheet: ViewerSheet;
  /** Override how a tile URL is built (default: the authorized /v1 tile route). */
  tileUrl?: (level: number, col: number, row: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const stateRef = useRef<{ viewport: Viewport | null; container: Size }>({
    viewport: null,
    container: { width: 0, height: 0 },
  });

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
  const [grabbing, setGrabbing] = useState(false);
  stateRef.current = { viewport, container };

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const dzi: DziInfo = useMemo(
    () => ({
      width: sheet.widthPx,
      height: sheet.heightPx,
      tileSize: TILE_SIZE,
      overlap: TILE_OVERLAP,
    }),
    [sheet.widthPx, sheet.heightPx],
  );
  const tileUrl = useCallback(
    (level: number, col: number, row: number) =>
      tileUrlProp
        ? tileUrlProp(level, col, row)
        : `/api/v1/sheets/${sheet.id}/tiles/tiles_files/${level}/${col}_${row}.png`,
    [sheet.id, tileUrlProp],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const { viewport: vp, container: box } = stateRef.current;
    if (!canvas || !vp || box.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);

    const getTile = (level: number, col: number, row: number): HTMLImageElement | null => {
      const key = `${level}/${col}_${row}`;
      const cached = cacheRef.current.get(key);
      if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
      const img = new Image();
      cacheRef.current.set(key, img);
      img.onload = () => requestAnimationFrame(draw); // repaint as detail streams in
      img.onerror = () => cacheRef.current.delete(key); // tolerate edge-tile 404s / allow retry
      img.src = tileUrl(level, col, row);
      return null;
    };

    // Overview first (under), then the best level on top — so something shows instantly.
    const best = bestLevel(dzi, vp.scale);
    const levels = best === overviewLevel(dzi) ? [best] : [overviewLevel(dzi), best];
    for (const level of levels) {
      const wpl = worldPerLevelPx(dzi, level);
      for (const t of visibleTiles(dzi, level, vp, box)) {
        const img = getTile(t.level, t.col, t.row);
        if (!img) continue;
        const p = vp.worldToScreen({ x: t.worldX, y: t.worldY });
        ctx.drawImage(
          img,
          p.x,
          p.y,
          img.naturalWidth * wpl * vp.scale,
          img.naturalHeight * wpl * vp.scale,
        );
      }
    }
  }, [dzi, tileUrl, dpr]);

  // New sheet → reset to its overview and drop cached tiles (switching sheets paints quickly).
  useEffect(() => {
    cacheRef.current = new Map();
    setViewport(null);
  }, [sheet.id]);

  // Measure the container and seed the overview viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const size = { width: r.width, height: r.height };
      setContainer(size);
      setViewport(
        (prev) => prev ?? Viewport.fit({ width: sheet.widthPx, height: sheet.heightPx }, size),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheet.widthPx, sheet.heightPx, sheet.id]);

  // Repaint on viewport/container change.
  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [viewport, container, draw]);

  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    setGrabbing(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setViewport((v) => (v ? v.panBy(dx, dy) : v));
  };
  const onPointerUp = () => {
    dragRef.current = null;
    setGrabbing(false);
  };
  const onWheel = (e: React.WheelEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = Math.exp(-e.deltaY * 0.0015);
    setViewport((v) => (v ? v.zoomAt(point, factor).clampScale(MIN_SCALE, MAX_SCALE, point) : v));
  };

  return (
    <div
      ref={wrapRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        position: 'relative',
        width: '100%',
        height: '70vh',
        overflow: 'hidden',
        background: '#f5f5f5',
        touchAction: 'none',
        cursor: grabbing ? 'grabbing' : 'grab',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}
