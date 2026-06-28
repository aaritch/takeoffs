import type {
  AssemblyInstanceView,
  AssemblyView,
  MeasurementGeometry,
  MeasurementType,
} from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { conditionsRepo } from '../conditions/repository';
import { NotFound, ValidationFailed } from '../conditions/errors';
import { computeRawValue, isGeometryAllowedForType, recomputeRollup } from '../measurements';
import {
  assembliesRepo,
  type Assembly,
  type AssemblyComponent,
  type AssemblyInstance,
} from './repository';

export interface CreateAssemblyInput {
  takeoffId: string;
  name: string;
  driverMeasurementType: MeasurementType;
  notes?: string;
  components: { conditionId: string; factor: number }[];
}

export interface DrawAssemblyInput {
  assemblyId: string;
  geometry: MeasurementGeometry;
  unitPerPixel: number;
  sheetId?: string | null;
}

export function assemblyToView(assembly: Assembly, components: AssemblyComponent[]): AssemblyView {
  return {
    id: assembly.id,
    takeoffId: assembly.takeoff_id,
    name: assembly.name,
    driverMeasurementType: assembly.driver_measurement_type,
    notes: assembly.notes,
    components: components.map((c) => ({
      id: c.id,
      conditionId: c.condition_id,
      factor: c.factor,
    })),
    createdAt: assembly.created_at.toISOString(),
  };
}

export function assemblyInstanceToView(i: AssemblyInstance): AssemblyInstanceView {
  return {
    id: i.id,
    assemblyId: i.assembly_id,
    sheetId: i.sheet_id,
    geomType: i.geom_type,
    geometry: i.geometry,
    baseValue: i.base_value,
    createdAt: i.created_at.toISOString(),
  };
}

/** Recompute the rollup of every condition an assembly drives (after a draw/edit/remove). */
async function recomputeMembers(tx: OrgScopedTx, assemblyId: string): Promise<void> {
  const components = await assembliesRepo.listComponents(tx, assemblyId);
  for (const c of components) {
    await recomputeRollup(tx, c.condition_id);
  }
}

/**
 * Assemblies (spec §6.5, P4-07): one drawn geometry drives several conditions through explicit
 * multiplier factors. The geometry is stored ONCE per draw (an assembly instance); each child
 * condition's rollup picks up `instance.base_value × component.factor` (see recomputeRollup), so the
 * relationship is auditable and editing the geometry recomputes every linked condition consistently.
 */
export const assemblyService = {
  async create(
    tx: OrgScopedTx,
    input: CreateAssemblyInput,
  ): Promise<{ assembly: Assembly; components: AssemblyComponent[] }> {
    // Every child condition must exist in THIS takeoff — keeps the relationship explicit + scoped.
    const seen = new Set<string>();
    for (const c of input.components) {
      if (seen.has(c.conditionId)) {
        throw ValidationFailed('A condition may appear at most once in an assembly', 'components');
      }
      seen.add(c.conditionId);
      if (!(c.factor > 0)) throw ValidationFailed('Each factor must be positive', 'factor');
      const condition = await conditionsRepo.getById(tx, c.conditionId);
      if (!condition || condition.takeoff_id !== input.takeoffId) {
        throw ValidationFailed('Component condition is not in this takeoff', 'conditionId');
      }
    }

    const assembly = await assembliesRepo.insert(tx, {
      org_id: (await conditionsRepo.getById(tx, input.components[0]!.conditionId))!.org_id,
      takeoff_id: input.takeoffId,
      name: input.name,
      driver_measurement_type: input.driverMeasurementType,
      notes: input.notes ?? null,
    });
    const components: AssemblyComponent[] = [];
    for (const c of input.components) {
      components.push(
        await assembliesRepo.insertComponent(tx, {
          org_id: assembly.org_id,
          assembly_id: assembly.id,
          condition_id: c.conditionId,
          factor: c.factor,
        }),
      );
    }
    return { assembly, components };
  },

  /** Draw one geometry against the assembly, then refresh every child condition's rollup. */
  async draw(tx: OrgScopedTx, input: DrawAssemblyInput): Promise<AssemblyInstance> {
    const assembly = await assembliesRepo.getById(tx, input.assemblyId);
    if (!assembly) throw NotFound('Assembly not found');
    if (!isGeometryAllowedForType(assembly.driver_measurement_type, input.geometry.type)) {
      throw ValidationFailed(
        `Geometry ${input.geometry.type} is not valid for a ${assembly.driver_measurement_type} assembly`,
        'geometry',
      );
    }
    const baseValue = computeRawValue(input.geometry, input.unitPerPixel);
    const instance = await assembliesRepo.insertInstance(tx, {
      org_id: assembly.org_id,
      assembly_id: assembly.id,
      sheet_id: input.sheetId ?? null,
      geom_type: input.geometry.type,
      geometry: input.geometry,
      base_value: baseValue,
    });
    await recomputeMembers(tx, assembly.id);
    return instance;
  },

  /** Replace an instance's geometry (recomputing base_value), then refresh every linked condition. */
  async updateInstanceGeometry(
    tx: OrgScopedTx,
    instanceId: string,
    geometry: MeasurementGeometry,
    unitPerPixel: number,
  ): Promise<AssemblyInstance> {
    const existing = await assembliesRepo.getInstanceById(tx, instanceId);
    if (!existing) throw NotFound('Assembly instance not found');
    const assembly = await assembliesRepo.getById(tx, existing.assembly_id);
    if (!assembly) throw NotFound('Assembly not found');
    if (!isGeometryAllowedForType(assembly.driver_measurement_type, geometry.type)) {
      throw ValidationFailed(
        `Geometry ${geometry.type} is not valid for a ${assembly.driver_measurement_type} assembly`,
        'geometry',
      );
    }
    const instance = await assembliesRepo.updateInstance(tx, instanceId, {
      geom_type: geometry.type,
      geometry,
      base_value: computeRawValue(geometry, unitPerPixel),
    });
    await recomputeMembers(tx, existing.assembly_id);
    return instance;
  },

  /** Remove a drawn instance and refresh every linked condition. */
  async removeInstance(tx: OrgScopedTx, instanceId: string): Promise<void> {
    const existing = await assembliesRepo.getInstanceById(tx, instanceId);
    if (!existing) throw NotFound('Assembly instance not found');
    await assembliesRepo.softDeleteInstance(tx, instanceId);
    await recomputeMembers(tx, existing.assembly_id);
  },

  async listByTakeoff(tx: OrgScopedTx, takeoffId: string): Promise<AssemblyView[]> {
    const list = await assembliesRepo.listByTakeoff(tx, takeoffId);
    const views: AssemblyView[] = [];
    for (const a of list) {
      views.push(assemblyToView(a, await assembliesRepo.listComponents(tx, a.id)));
    }
    return views;
  },
};
