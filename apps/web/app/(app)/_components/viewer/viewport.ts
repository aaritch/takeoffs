/**
 * Viewport transform (P1-06) — the single mapping between WORLD space (a sheet's full-resolution
 * pixels) and SCREEN space (canvas CSS pixels): `screen = world * scale + translate`. Immutable
 * so it slots into React state cleanly. This is the transform the overlay layer (P1-07) shares,
 * so measurements drawn over the image stay glued to it through every pan/zoom.
 */

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

export class Viewport {
  constructor(
    readonly scale: number,
    readonly tx: number,
    readonly ty: number,
  ) {}

  worldToScreen(p: Point): Point {
    return { x: p.x * this.scale + this.tx, y: p.y * this.scale + this.ty };
  }

  screenToWorld(p: Point): Point {
    return { x: (p.x - this.tx) / this.scale, y: (p.y - this.ty) / this.scale };
  }

  /** Pan by a screen-space delta. */
  panBy(dx: number, dy: number): Viewport {
    return new Viewport(this.scale, this.tx + dx, this.ty + dy);
  }

  /** Zoom by `factor` while keeping the world point under `screenPoint` fixed (cursor-anchored). */
  zoomAt(screenPoint: Point, factor: number): Viewport {
    const world = this.screenToWorld(screenPoint);
    const scale = this.scale * factor;
    return new Viewport(scale, screenPoint.x - world.x * scale, screenPoint.y - world.y * scale);
  }

  /** Clamp the scale to [min, max] while keeping `anchor` (default screen origin) fixed. */
  clampScale(min: number, max: number, anchor: Point = { x: 0, y: 0 }): Viewport {
    const clamped = Math.min(max, Math.max(min, this.scale));
    if (clamped === this.scale) return this;
    return this.zoomAt(anchor, clamped / this.scale);
  }

  /** Overview transform: scale `content` to fit inside `container`, centered (instant first paint). */
  static fit(content: Size, container: Size): Viewport {
    if (content.width <= 0 || content.height <= 0) return new Viewport(1, 0, 0);
    const scale = Math.min(container.width / content.width, container.height / content.height);
    return new Viewport(
      scale,
      (container.width - content.width * scale) / 2,
      (container.height - content.height * scale) / 2,
    );
  }

  /** The world-space rectangle currently visible in a `container`-sized viewport. */
  visibleWorldRect(container: Size): { x: number; y: number; width: number; height: number } {
    const tl = this.screenToWorld({ x: 0, y: 0 });
    const br = this.screenToWorld({ x: container.width, y: container.height });
    return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  }
}
