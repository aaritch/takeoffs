import { NextResponse } from 'next/server';
import {
  CreateAssemblyRequest,
  type AssembliesResponse,
  type AssemblyResponse,
} from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { assemblyService, assemblyToView } from '@/server/modules/assemblies';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** GET /v1/takeoffs/{id}/assemblies — the takeoff's assemblies + their weighted components (P4-07). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const assemblies = await withOrgScope(getAppDb(), orgId, (tx) =>
      assemblyService.listByTakeoff(tx, id),
    );
    const body: AssembliesResponse = { assemblies };
    return NextResponse.json(body);
  });
}

/** POST /v1/takeoffs/{id}/assemblies — define an assembly with explicit per-condition factors. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const input = await parseBody(request, CreateAssemblyRequest);
    const { assembly, components } = await withOrgScope(getAppDb(), orgId, (tx) =>
      assemblyService.create(tx, {
        takeoffId: id,
        name: input.name,
        driverMeasurementType: input.driverMeasurementType,
        components: input.components,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      }),
    );
    const body: AssemblyResponse = { assembly: assemblyToView(assembly, components) };
    return NextResponse.json(body, { status: 201 });
  });
}
