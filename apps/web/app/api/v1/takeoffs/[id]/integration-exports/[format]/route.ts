import { NextResponse } from 'next/server';
import { IntegrationFormat } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { buildReportData, renderIntegrationExport } from '@/server/modules/reports';
import { ApiError, apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * GET /v1/takeoffs/{id}/integration-exports/{format} — a structured, version-pinned interchange
 * export of the takeoff for estimating/accounting tools (P4-08). Quantities come straight from the
 * authoritative (scale-gated) rollups, so they equal the takeoff exactly. Malformed/partial data is
 * rejected (422) before any file is produced, never emitted as a corrupt file.
 *
 * Synchronous: this reads already-computed rollups and renders a small text/JSON file — not heavy
 * work, so it doesn't need the background-job path the template reports use.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const parsed = IntegrationFormat.safeParse(format);
    if (!parsed.success) {
      throw new ApiError(404, 'NOT_FOUND', `Unknown integration format "${format}".`);
    }
    const data = await withOrgScope(getAppDb(), orgId, (tx) => buildReportData(tx, id));
    const out = renderIntegrationExport(parsed.data, data); // throws IntegrationExportError (→ 422)
    return new NextResponse(out.content, {
      status: 200,
      headers: {
        'content-type': out.contentType,
        'content-disposition': `attachment; filename="${out.fileName}"`,
        'x-format-version': out.formatVersion,
      },
    });
  });
}
