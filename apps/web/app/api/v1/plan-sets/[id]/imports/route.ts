import { NextResponse } from 'next/server';
import { ImportFromCloudRequest, type ImportFromCloudResponse } from '@takeoff/contracts';
import { getAppDb } from '@/server/data/org-scope';
import { cloudImportService, stubCloudProvider } from '@/server/modules/cloud-import';
import { getStorage } from '@/server/storage';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/plan-sets/{id}/imports — import files from a connected cloud source into the plan set
 * (P5-05). Each file is fetched, validated like an upload, stored, and handed to the SAME ingestion
 * pipeline (incl. malware scan). Per-file failures are reported in `failed` (no half-imported set).
 *
 * Uses the stub cloud provider until the real OAuth-backed adapters land (the integration point).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const input = await parseBody(request, ImportFromCloudRequest);
    const result = await cloudImportService.importFiles(
      getAppDb(),
      getStorage(),
      orgId,
      {
        planSetId: id,
        files: input.files.map((f) => ({
          provider: input.provider,
          externalId: f.externalId,
          filename: f.filename,
          mimeType: f.mimeType,
          ...(f.accessToken !== undefined ? { accessToken: f.accessToken } : {}),
        })),
      },
      { provider: stubCloudProvider },
    );
    const body: ImportFromCloudResponse = result;
    return NextResponse.json(body, { status: result.imported.length > 0 ? 201 : 207 });
  });
}
