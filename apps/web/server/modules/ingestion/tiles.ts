import type { DB } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { orgStorageKey } from '../../storage/keys';
import type { StorageAdapter } from '../../storage';
import { NotFound, ValidationFailed } from '../source-files/errors';
import { sheetsRepo } from './repository';

/**
 * Serve a sheet's tile/thumbnail/descriptor objects to the viewer (P1-06). The sheet is loaded
 * under the caller's org scope (RLS) — so another tenant's sheet 404s — and the object key is
 * rebuilt from the org + sheet, never from client input, after rejecting any unsafe path segment.
 * Object storage is private; this is the authorized read path the deep-zoom viewer points at.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const CONTENT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.dzi': 'application/xml',
};

export interface TileObject {
  bytes: Uint8Array;
  contentType: string;
}

export async function getTileObject(
  db: DB,
  storage: StorageAdapter,
  input: { orgId: string; sheetId: string; path: string[] },
): Promise<TileObject> {
  if (
    input.path.length === 0 ||
    input.path.some((s) => s === '.' || s === '..' || !SAFE_SEGMENT.test(s))
  ) {
    throw ValidationFailed('Invalid tile path');
  }

  const sheet = await withOrgScope(db, input.orgId, (tx) => sheetsRepo.getById(tx, input.sheetId));
  if (!sheet || !sheet.tile_pyramid_key) throw NotFound('Sheet tiles not found');

  const prefix = orgStorageKey(input.orgId, 'plan-sets', sheet.plan_set_id, 'sheets', sheet.id);
  const key = `${prefix}/${input.path.join('/')}`;

  let bytes: Uint8Array;
  try {
    bytes = await storage.getObject(key);
  } catch {
    throw NotFound('Tile not found');
  }

  const last = input.path[input.path.length - 1]!;
  const ext = last.slice(last.lastIndexOf('.')).toLowerCase();
  return { bytes, contentType: CONTENT_TYPE[ext] ?? 'application/octet-stream' };
}
