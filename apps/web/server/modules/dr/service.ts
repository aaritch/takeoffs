import type { DB } from '../../data/client';
import { runRestoreDrill, type DrillOptions, type DrillReport } from './drill';
import { drDrillRunsRepo, type DrDrillRun } from './repository';

/**
 * Disaster-recovery service (P5-01). Runs a real restore drill and RECORDS the outcome, so the
 * "drills run on a schedule" requirement is auditable — a scheduler hits `runAndRecord` periodically
 * and the history shows the last successful restore (the caveat: a backup never restored isn't one).
 */
export const drService = {
  async runAndRecord(
    db: DB,
    opts: DrillOptions = {},
  ): Promise<{ report: DrillReport; run: DrDrillRun }> {
    const report = await runRestoreDrill(db, opts);
    const run = await db.transaction((tx) =>
      drDrillRunsRepo.insert(tx, {
        status: report.status,
        integrity_ok: report.integrityOk,
        restored_row_count: report.restoredRowCount,
        data_loss_seconds: report.dataLossSeconds,
        recovery_seconds: report.recoverySeconds,
        within_rpo: report.withinRpo,
        within_rto: report.withinRto,
        report: report as unknown as Record<string, unknown>,
      }),
    );
    return { report, run };
  },

  listRuns(db: DB): Promise<DrDrillRun[]> {
    return db.transaction((tx) => drDrillRunsRepo.listRecent(tx));
  },
};
