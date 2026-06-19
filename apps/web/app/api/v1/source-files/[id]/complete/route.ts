import { NextResponse } from 'next/server';
import { CompleteUploadRequest } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { sourceFilesService } from '@/server/modules/source-files';
import { getStorage } from '@/server/storage';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/source-files/{id}/complete — client reports the upload finished; the API verifies. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: sourceFileId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const body = await parseBody(request, CompleteUploadRequest);
    const sourceFile = await withOrgScope(getAppDb(), orgId, (tx) =>
      sourceFilesService.completeUpload(tx, getStorage(), { sourceFileId, ...body }),
    );
    // A rejected upload is a 422 carrying the file's state; a verified one is 200.
    const status = sourceFile.uploadStatus === 'REJECTED' ? 422 : 200;
    return NextResponse.json({ sourceFile }, { status });
  });
}
