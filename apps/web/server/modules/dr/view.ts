import type { DrillReportView, DrillRunView } from '@takeoff/contracts';
import type { DrillReport } from './drill';
import type { DrDrillRun } from './repository';

export function drillReportToView(r: DrillReport): DrillReportView {
  return {
    status: r.status,
    integrityOk: r.integrityOk,
    expectedRowCount: r.expectedRowCount,
    restoredRowCount: r.restoredRowCount,
    dataLossSeconds: r.dataLossSeconds,
    recoverySeconds: r.recoverySeconds,
    withinRpo: r.withinRpo,
    withinRto: r.withinRto,
    steps: r.steps,
  };
}

export function drillRunToView(d: DrDrillRun): DrillRunView {
  return {
    id: d.id,
    status: d.status as DrillRunView['status'],
    integrityOk: d.integrity_ok,
    restoredRowCount: d.restored_row_count,
    dataLossSeconds: d.data_loss_seconds,
    recoverySeconds: d.recovery_seconds,
    withinRpo: d.within_rpo,
    withinRto: d.within_rto,
    ranAt: d.created_at.toISOString(),
  };
}
