import { NextResponse } from 'next/server';
import type { ModelVersionResponse } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { modelRegistryService, modelVersionToView } from '@/server/modules/model-registry';
import { platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/ops/models/{family}/rollback — roll serving back to the version the active one superseded
 * (P4-06). PLATFORM_ADMIN only. A version switch, not a redeploy — takes effect immediately.
 */
export async function POST(request: Request, ctx: { params: Promise<{ family: string }> }) {
  const { family } = await ctx.params;
  return platformHandler(
    request,
    async () => {
      const model = await modelRegistryService.rollback(getDb(), family);
      const body: ModelVersionResponse = { model: modelVersionToView(model) };
      return NextResponse.json(body);
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}
