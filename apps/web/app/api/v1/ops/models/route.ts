import { NextResponse } from 'next/server';
import type { ModelVersionsResponse, ModelVersionResponse } from '@takeoff/contracts';
import { RegisterModelVersionRequest } from '@takeoff/contracts';
import { getDb } from '@/server/data/client';
import { modelRegistryService, modelVersionToView } from '@/server/modules/model-registry';
import { parseBody, platformHandler } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/ops/models[?family=<f>] — registered model versions (P4-06). Platform staff only. */
export async function GET(request: Request) {
  return platformHandler(
    request,
    async () => {
      const family = new URL(request.url).searchParams.get('family');
      const rows = family
        ? await modelRegistryService.listByFamily(getDb(), family)
        : await modelRegistryService.listRecent(getDb());
      const body: ModelVersionsResponse = { models: rows.map(modelVersionToView) };
      return NextResponse.json(body);
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}

/**
 * POST /v1/ops/models — register an evaluated candidate model version (P4-06). PLATFORM_ADMIN only.
 * Registration does not serve the version — it must be promoted, which is gated on non-regression.
 */
export async function POST(request: Request) {
  return platformHandler(
    request,
    async () => {
      const input = await parseBody(request, RegisterModelVersionRequest);
      const model = await modelRegistryService.registerCandidate(getDb(), input);
      const body: ModelVersionResponse = { model: modelVersionToView(model) };
      return NextResponse.json(body, { status: 201 });
    },
    { roles: ['PLATFORM_ADMIN'] },
  );
}
