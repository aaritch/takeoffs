import { NextResponse } from 'next/server';
import { UpdateAssemblyInstanceRequest, type AssemblyInstanceResponse } from '@takeoff/contracts';
import { getAppDb, withOrgScope } from '@/server/data/org-scope';
import { assemblyInstanceToView, assemblyService } from '@/server/modules/assemblies';
import { apiHandler, parseBody } from '@/server/platform/api';

export const dynamic = 'force-dynamic';

/** PATCH /v1/assembly-instances/{id} — replace the drawn geometry; every child condition recomputes. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    const input = await parseBody(request, UpdateAssemblyInstanceRequest);
    const instance = await withOrgScope(getAppDb(), orgId, (tx) =>
      assemblyService.updateInstanceGeometry(tx, id, input.geometry, input.unitPerPixel),
    );
    const body: AssemblyInstanceResponse = { instance: assemblyInstanceToView(instance) };
    return NextResponse.json(body);
  });
}

/** DELETE /v1/assembly-instances/{id} — remove the drawn instance; every child condition recomputes. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiHandler(request, async ({ orgId }) => {
    await withOrgScope(getAppDb(), orgId, (tx) => assemblyService.removeInstance(tx, id));
    return NextResponse.json({ ok: true });
  });
}
