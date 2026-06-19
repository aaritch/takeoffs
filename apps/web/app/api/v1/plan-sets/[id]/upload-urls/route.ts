import { NextResponse } from 'next/server';
import { CreateUploadUrlsRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { sourceFilesService } from '@/server/modules/source-files';
import { getStorage } from '@/server/storage';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/plan-sets/{id}/upload-urls — issue short-lived signed PUT URLs for a batch of files. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: planSetId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, CreateUploadUrlsRequest);
    const result = await withOrgScope(getAppDb(), orgId, (tx) =>
      sourceFilesService.createUploadUrls(tx, getStorage(), { planSetId, files: body.files }),
    );
    return NextResponse.json(result, { status: 200 });
  });
}
