// Assemblies module (P4-07) — one drawn geometry driving multiple conditions via explicit multiplier
// factors. The geometry is stored once per draw (an assembly instance); each child condition's rollup
// reflects `instance.base_value × component.factor` via the contribution query, so editing the
// geometry recomputes every linked condition consistently and the multipliers stay visible/auditable.
export {
  assemblyService,
  assemblyToView,
  assemblyInstanceToView,
  type CreateAssemblyInput,
  type DrawAssemblyInput,
} from './service';
export { assembliesRepo } from './repository';
export type { Assembly, AssemblyComponent, AssemblyInstance } from './repository';
