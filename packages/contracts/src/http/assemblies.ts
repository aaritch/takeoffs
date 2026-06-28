import { z } from 'zod';
import { MeasurementGeometry } from '../measurements';
import { GeometryType, MeasurementType } from '../enums';

/**
 * Assemblies (spec §6.5, P4-07) — one drawn geometry driving multiple conditions via explicit
 * multiplier factors. The factors are first-class + visible so quantities stay auditable (the caveat).
 */

/** A child condition driven by an assembly, with its explicit multiplier. */
export const AssemblyComponentView = z.object({
  id: z.string().uuid(),
  conditionId: z.string().uuid(),
  factor: z.number(),
});
export type AssemblyComponentView = z.infer<typeof AssemblyComponentView>;

export const AssemblyView = z.object({
  id: z.string().uuid(),
  takeoffId: z.string().uuid(),
  name: z.string(),
  driverMeasurementType: MeasurementType,
  notes: z.string().nullable(),
  components: z.array(AssemblyComponentView),
  createdAt: z.string().datetime(),
});
export type AssemblyView = z.infer<typeof AssemblyView>;

export const AssemblyInstanceView = z.object({
  id: z.string().uuid(),
  assemblyId: z.string().uuid(),
  sheetId: z.string().uuid().nullable(),
  geomType: GeometryType,
  geometry: MeasurementGeometry,
  baseValue: z.number(),
  createdAt: z.string().datetime(),
});
export type AssemblyInstanceView = z.infer<typeof AssemblyInstanceView>;

/** POST /v1/takeoffs/{id}/assemblies — define an assembly + its weighted child conditions. */
export const CreateAssemblyRequest = z.object({
  name: z.string().min(1),
  driverMeasurementType: MeasurementType,
  notes: z.string().optional(),
  components: z
    .array(
      z.object({
        conditionId: z.string().uuid(),
        // A factor must be positive — a zero/negative multiplier is never a valid assembly link.
        factor: z.number().positive(),
      }),
    )
    .min(1),
});
export type CreateAssemblyRequest = z.infer<typeof CreateAssemblyRequest>;

/** POST /v1/assemblies/{id}/instances — draw one geometry against the assembly. */
export const DrawAssemblyRequest = z.object({
  geometry: MeasurementGeometry,
  unitPerPixel: z.number().positive(),
  sheetId: z.string().uuid().optional(),
});
export type DrawAssemblyRequest = z.infer<typeof DrawAssemblyRequest>;

/** PATCH /v1/assembly-instances/{id} — replace the drawn geometry (recomputes every child). */
export const UpdateAssemblyInstanceRequest = z.object({
  geometry: MeasurementGeometry,
  unitPerPixel: z.number().positive(),
});
export type UpdateAssemblyInstanceRequest = z.infer<typeof UpdateAssemblyInstanceRequest>;

export const AssemblyResponse = z.object({ assembly: AssemblyView });
export type AssemblyResponse = z.infer<typeof AssemblyResponse>;

export const AssembliesResponse = z.object({ assemblies: z.array(AssemblyView) });
export type AssembliesResponse = z.infer<typeof AssembliesResponse>;

export const AssemblyInstanceResponse = z.object({ instance: AssemblyInstanceView });
export type AssemblyInstanceResponse = z.infer<typeof AssemblyInstanceResponse>;
