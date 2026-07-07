// Model registry (P4-06) — the promote/rollback lifecycle for served model versions, behind the
// benchmark non-regression gate (invariant §6). A model is promoted only if it regresses no tracked
// benchmark metric; promotion and rollback are version-flag flips (one ACTIVE per family), not
// redeploys; the ACTIVE serving set is stamped onto every ModelRun for auditability.
export { modelRegistryService, type RegisterCandidateInput } from './service';
export { nonRegresses, type NonRegressionResult, type MetricRegression } from './non-regression';
export { modelVersionsRepo, type ModelVersion } from './repository';
export { modelVersionToView } from './view';
