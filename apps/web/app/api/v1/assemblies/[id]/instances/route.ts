import { NextResponse } from 'next/server';
import { DrawAssemblyRequest, type AssemblyInstanceResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { assemblyInstanceToView, assemblyService } from '@/server/modules/assemblies';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/**
 * POST /v1/assemblies/{id}/instances — draw one geometry against the assembly (P4-07). The server
 * computes the driver base and fans it to every child condition by its factor (rollups recompute).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const input = await parseBody(request, DrawAssemblyRequest);
    const instance = await withOrgScope(getAppDb(), orgId, (tx) =>
      assemblyService.draw(tx, {
        assemblyId: id,
        geometry: input.geometry,
        unitPerPixel: input.unitPerPixel,
        sheetId: input.sheetId ?? null,
      }),
    );
    const body: AssemblyInstanceResponse = { instance: assemblyInstanceToView(instance) };
    return NextResponse.json(body, { status: 201 });
  });
}
