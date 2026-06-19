import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { THUMBNAIL_MAX_PX, TILE_OVERLAP, TILE_SIZE } from '@takeoff/contracts';
import type { StorageAdapter } from '../../storage';

/**
 * Deep-zoom tiling (P1-03). Cuts a page raster into a DZI pyramid (square tiles, fixed overlap,
 * resolution halving per level) plus a thumbnail, and uploads everything under the sheet's prefix
 * (keys match the conventions in @takeoff/contracts/tiles so the viewer lines up). sharp writes
 * the pyramid to a temp dir, which we walk and upload; the temp dir is always cleaned up.
 */

export interface TileResult {
  width: number;
  height: number;
  tileCount: number;
  /** Key of the DZI descriptor (the pyramid entry point). */
  tilePyramidKey: string;
  thumbnailKey: string;
}

export interface Tiler {
  tile(
    storage: StorageAdapter,
    input: { png: Uint8Array; width: number; height: number; sheetPrefix: string },
  ): Promise<TileResult>;
}

/** Recursively list files (absolute path + key-relative path) under a directory. */
async function walk(dir: string, rel = ''): Promise<{ abs: string; rel: string }[]> {
  const out: { abs: string; rel: string }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(abs, relPath)));
    else out.push({ abs, rel: relPath });
  }
  return out;
}

const contentType = (name: string): string =>
  name.endsWith('.dzi') ? 'application/xml' : name.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';

export const defaultTiler: Tiler = {
  async tile(storage, { png, width, height, sheetPrefix }): Promise<TileResult> {
    const dir = await mkdtemp(join(tmpdir(), 'takeoff-tiles-'));
    try {
      // sharp writes <base>.dzi + <base>_files/<level>/<x>_<y>.png
      await sharp(Buffer.from(png))
        .png()
        .tile({ size: TILE_SIZE, overlap: TILE_OVERLAP, layout: 'dz' })
        .toFile(join(dir, 'tiles'));

      const files = await walk(dir);
      let tileCount = 0;
      await Promise.all(
        files.map(async (f) => {
          const body = await readFile(f.abs);
          await storage.putObject(
            `${sheetPrefix}/${f.rel}`,
            new Uint8Array(body),
            contentType(f.rel),
          );
          if (f.rel !== 'tiles.dzi') tileCount += 1;
        }),
      );

      const thumb = await sharp(Buffer.from(png))
        .resize(THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX, { fit: 'inside' })
        .png()
        .toBuffer();
      const thumbnailKey = `${sheetPrefix}/thumbnail.png`;
      await storage.putObject(thumbnailKey, new Uint8Array(thumb), 'image/png');

      return {
        width,
        height,
        tileCount,
        tilePyramidKey: `${sheetPrefix}/tiles.dzi`,
        thumbnailKey,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
