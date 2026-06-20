'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewport, type Size } from './viewport';
import { drawTiles } from './tile-render';
import { drawVectors } from './vector-render';
import { pickAtScreen, type OverlayMeasurement } from './hit-test';

/**
 * The composed sheet viewer (P1-06 + P1-07): a tile layer and a vector overlay stacked on ONE
 * shared viewport, so measurements stay pixel-aligned to the drawing through every pan/zoom. The
 * single pointer surface distinguishes a drag (pan) from a click (select via vector hit-test);
 * geometry is read in normalized sheet coordinates and projected to screen every frame.
 */

export interface ViewerSheet {
  id: string;
  widthPx: number;
  heightPx: number;
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 8;
const DRAG_THRESHOLD = 4;
const PICK_PX = 6;
const PALETTE = ['#0057ff', '#e0007a', '#00875a', '#d9480f', '#7048e8', '#0c8599', '#e8590c'];

function defaultColorFor(conditionId: string): string {
  let h = 0;
  for (let i = 0; i < conditionId.length; i++) h = (h * 31 + conditionId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

export function LayeredViewer({
  sheet,
  measurements = [],
  colorFor = defaultColorFor,
  onSelectionChange,
  tileUrl: tileUrlProp,
}: {
  sheet: ViewerSheet;
  measurements?: OverlayMeasurement[];
  colorFor?: (conditionId: string) => string;
  onSelectionChange?: (ids: string[]) => void;
  tileUrl?: (level: number, col: number, row: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tileCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [grabbing, setGrabbing] = useState(false);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const tileUrl = useCallback(
    (l: number, c: number, r: number) =>
      tileUrlProp
        ? tileUrlProp(l, c, r)
        : `/api/v1/sheets/${sheet.id}/tiles/tiles_files/${l}/${c}_${r}.png`,
    [sheet.id, tileUrlProp],
  );

  const drawAll = useCallback(() => {
    if (!viewport) return;
    const tc = tileCanvasRef.current;
    const oc = overlayCanvasRef.current;
    if (tc)
      drawTiles(tc, {
        sheet,
        viewport,
        container,
        dpr,
        cache: cacheRef.current,
        tileUrl,
        onTileLoad: () => requestAnimationFrame(drawAll),
      });
    if (oc) drawVectors(oc, { viewport, container, dpr, measurements, selectedIds, colorFor });
  }, [sheet, viewport, container, dpr, tileUrl, measurements, selectedIds, colorFor]);

  useEffect(() => {
    cacheRef.current = new Map();
    setViewport(null);
    setSelectedIds(new Set());
  }, [sheet.id]);

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

  useEffect(() => {
    const id = requestAnimationFrame(drawAll);
    return () => cancelAnimationFrame(id);
  }, [drawAll]);

  useEffect(() => {
    onSelectionChange?.([...selectedIds]);
  }, [selectedIds, onSelectionChange]);

  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      d.moved = true;
      setGrabbing(true);
    }
    if (d.moved) {
      d.x = e.clientX;
      d.y = e.clientY;
      setViewport((v) => (v ? v.panBy(dx, dy) : v));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGrabbing(false);
    if (!drag || drag.moved || !viewport) return; // a drag was a pan, not a click
    const id = pickAtScreen(measurements, local(e), viewport, PICK_PX);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    setSelectedIds((prev) => {
      const next = new Set(additive ? prev : []);
      if (id) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };
  const onWheel = (e: React.WheelEvent) => {
    const point = local(e);
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
        cursor: grabbing ? 'grabbing' : 'crosshair',
      }}
    >
      <canvas ref={tileCanvasRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas
        ref={overlayCanvasRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  );
}
