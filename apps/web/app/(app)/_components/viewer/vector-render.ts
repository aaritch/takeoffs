import type { Point } from '@takeoff/contracts';
import { Viewport, type Size } from './viewport';
import type { OverlayMeasurement } from './hit-test';

/**
 * Draw the vector overlay (P1-07): every measurement for the sheet, color-coded by condition,
 * with selected ones emphasized. Screen positions are derived from the shared viewport every
 * frame — geometry is only ever stored in normalized sheet coordinates (the spec §9 caveat), so
 * the overlay stays pixel-aligned to the tiles at any zoom. Canvas (not SVG) keeps thousands of
 * objects cheap to repaint.
 */

export interface VectorDrawParams {
  viewport: Viewport;
  container: Size;
  dpr: number;
  measurements: OverlayMeasurement[];
  selectedIds: ReadonlySet<string>;
  colorFor: (conditionId: string) => string;
  /** The in-progress drawing (P1-09), rendered dashed on top so the user sees what they're placing. */
  draft?: { tool: 'LINEAR' | 'AREA' | 'COUNT'; vertices: Point[] };
}

function drawDraft(
  ctx: CanvasRenderingContext2D,
  draft: NonNullable<VectorDrawParams['draft']>,
  toScreen: (p: Point) => Point,
): void {
  const pts = draft.vertices.map(toScreen);
  ctx.save();
  ctx.strokeStyle = '#111';
  ctx.fillStyle = '#111';
  ctx.lineWidth = 1.75;
  ctx.setLineDash([5, 4]);
  if ((draft.tool === 'LINEAR' || draft.tool === 'AREA') && pts.length >= 2) {
    ctx.beginPath();
    pts.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
    if (draft.tool === 'AREA') ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const s of pts) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, s: Point, r: number): void {
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, pts: Point[], toScreen: (p: Point) => Point): void {
  pts.forEach((p, i) => {
    const s = toScreen(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

export function drawVectors(canvas: HTMLCanvasElement, p: VectorDrawParams): void {
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

  const S = (pt: Point) => vp.worldToScreen(pt);

  for (const m of p.measurements) {
    const selected = p.selectedIds.has(m.id);
    const color = p.colorFor(m.conditionId);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = selected ? 3.5 : 1.75;
    ctx.lineJoin = 'round';

    const g = m.geometry;
    switch (g.type) {
      case 'POINT':
        dot(ctx, S(g.point), selected ? 6 : 4);
        break;
      case 'POINT_GROUP':
        for (const q of g.points) dot(ctx, S(q), selected ? 6 : 4);
        break;
      case 'POLYLINE': {
        ctx.beginPath();
        g.points.forEach((q, i) => {
          const s = S(q);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
        break;
      }
      case 'POLYGON': {
        ctx.beginPath();
        ring(ctx, g.exterior, S);
        for (const h of g.holes ?? []) ring(ctx, h, S);
        ctx.save();
        ctx.globalAlpha = selected ? 0.25 : 0.12;
        ctx.fill('evenodd');
        ctx.restore();
        ctx.stroke();
        break;
      }
    }
  }

  if (p.draft && p.draft.vertices.length > 0) drawDraft(ctx, p.draft, S);
}
