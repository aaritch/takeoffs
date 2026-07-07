import { NextResponse } from 'next/server';
import type { ModelVersionResponse } from '@takeoff/contracts';
import { PromoteModelRequest } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { modelRegistryService, modelVersionToView } from '@/server/modules/model-registry';
import { parseBody, platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/ops/models/{family}/promote — promote a candidate to the served (ACTIVE) version (P4-06).
 * PLATFORM_ADMIN only. Blocked (VALIDATION_FAILED) if any tracked benchmark metric regresses.
 */
export async function POST(request: Request, ctx: { params: Promise<{ family: string }> }) {
  const { family } = await ctx.params;
  return platformHandler(
    request,
    async () => {
      const { version } = await parseBody(request, PromoteModelRequest);
      const model = await modelRegistryService.promote(getDb(), family, version);
      const body: ModelVersionResponse = { model: modelVersionToView(model) };
      return NextResponse.json(body);
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}
