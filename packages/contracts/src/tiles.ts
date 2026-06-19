/**
 * Tiling + raster conventions (P1-03), shared because the worker PRODUCES tiles and the viewer
 * (P1-06) CONSUMES them — they must agree exactly or overlays misalign (spec §10.3 caveat).
 *
 * The pyramid is a standard Deep Zoom Image (DZI): square tiles, a fixed overlap, resolution
 * halving each level. A sheet's artifacts live under its prefix:
 *   <sheetPrefix>/tiles.dzi            — the DZI descriptor
 *   <sheetPrefix>/tiles_files/<l>/<x>_<y>.png — tiles per level
 *   <sheetPrefix>/thumbnail.png        — the overview thumbnail
 */

/** Square tile edge, in pixels (DZI). */
export const TILE_SIZE = 256;

/** Tile overlap, in pixels — adjacent tiles share this many pixels so seams don't show. */
export const TILE_OVERLAP = 1;

/** Tile image format. PNG (lossless) — JPEG artifacts would harm line-art detection later. */
export const TILE_FORMAT = 'png';

/** Longest edge of the overview thumbnail, in pixels. */
export const THUMBNAIL_MAX_PX = 256;

/**
 * Working raster DPI for rendering pages. PROVISIONAL (150) — settle with the domain estimator
 * (STATE §7 open TBD): too low harms AI detection later, too high explodes storage/processing.
 */
export const WORKING_DPI = 150;
