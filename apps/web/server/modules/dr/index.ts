// Disaster recovery module (P5-01) — multi-region readiness + DR restore drills. A drill performs a
// real backup → simulated-loss → restore → integrity-verify cycle on a safe temp canary, checks the
// result against the RPO/RTO objectives, and records it so the scheduled-drill requirement is
// auditable (a backup never restored is not a backup).
export {
  RPO_TARGET_SECONDS,
  RTO_TARGET_SECONDS,
  evaluateRecovery,
  type RecoveryMeasurement,
  type RecoveryEvaluation,
} from './recovery-objectives';
export { runRestoreDrill, type DrillReport, type DrillOptions } from './drill';
export { drService } from './service';
export { drDrillRunsRepo, type DrDrillRun } from './repository';
export { drillReportToView, drillRunToView } from './view';
