import { NextResponse } from 'next/server';
import { getAppDb } from '@/server/data/org-scope';
import { retrySourceFile } from '@/server/modules/source-files';
import { apiHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** POST /v1/source-files/{id}/retry — re-enqueue ingestion for a FAILED file (P1-05). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: sourceFileId } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    await retrySourceFile(getAppDb(), { orgId, sourceFileId });
    return NextResponse.json({ ok: true });
  });
}
