import { getAppDb } from '@/server/data/org-scope';
import { getTileObject } from '@/server/modules/ingestion';
import { apiHandler } from '@/server/platform/api';
import { getStorage } from '@/server/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /v1/sheets/{id}/tiles/{...path} — the authorized read path the deep-zoom viewer points at
 * (e.g. .../tiles/tiles.dzi, .../tiles/tiles_files/8/0_0.png). Object storage is private; the
 * service rebuilds the key from the org + sheet (RLS-scoped) so tiles can't be read cross-tenant.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const tile = await getTileObject(getAppDb(), getStorage(), { orgId, sheetId: id, path });
    // Uint8Array is a valid Response body at runtime; the cast sidesteps the TS 5.9 typed-array
    // generic not matching BodyInit.
    return new Response(tile.bytes as unknown as BodyInit, {
      headers: { 'content-type': tile.contentType, 'cache-control': 'private, max-age=3600' },
    });
  });
}
