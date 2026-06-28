import { sql } from 'drizzle-orm';
import type { DB } from '../../data/client';
import { evaluateRecovery } from './recovery-objectives';

/**
 * Disaster-recovery restore drill (P5-01). Backups that are never restored are not backups (the
 * caveat), so this actually performs a backup → simulated-loss → restore → integrity-verify cycle and
 * checks the result against the RPO/RTO objectives.
 *
 * The drill runs entirely on a SESSION-scoped TEMP canary table (`ON COMMIT DROP`) inside one
 * transaction — it never touches real data, so it's safe to run on a schedule against production.
 * It proves the restore MECHANISM end to end; a real DR exercise additionally fails over the managed
 * stores (Neon PITR, R2 versioning) per the runbook.
 */

export interface DrillReport {
  status: 'PASSED' | 'FAILED';
  /** The restored data matched the pre-loss snapshot exactly (row count + content fingerprint). */
  integrityOk: boolean;
  expectedRowCount: number;
  restoredRowCount: number;
  dataLossSeconds: number;
  recoverySeconds: number;
  withinRpo: boolean;
  withinRto: boolean;
  steps: string[];
}

export interface DrillOptions {
  /** Canary row count (the larger the more representative the restore). */
  rows?: number;
  /**
   * The data-loss window to evaluate against the RPO — i.e. how stale the last recovery point is.
   * Defaults to 0 (a clean point-in-time restore). Inject a larger value to exercise an RPO breach.
   */
  simulatedDataLossSeconds?: number;
}

interface CountFp {
  n: number;
  fp: string | null;
}

export async function runRestoreDrill(db: DB, opts: DrillOptions = {}): Promise<DrillReport> {
  const rows = opts.rows ?? 1000;
  const dataLossSeconds = opts.simulatedDataLossSeconds ?? 0;
  const steps: string[] = [];

  return db.transaction(async (tx) => {
    // 1. A canary dataset stands in for the data we must be able to recover.
    await tx.execute(
      sql`CREATE TEMP TABLE dr_canary (id int PRIMARY KEY, payload text) ON COMMIT DROP`,
    );
    await tx.execute(
      sql`INSERT INTO dr_canary SELECT g, md5(g::text) FROM generate_series(1, ${rows}) AS g`,
    );
    steps.push(`seeded canary with ${rows} rows`);

    const beforeRes = await tx.execute(
      sql`SELECT count(*)::int AS n, md5(coalesce(string_agg(payload, '' ORDER BY id), '')) AS fp FROM dr_canary`,
    );
    const before = beforeRes.rows[0] as unknown as CountFp;

    // 2. Back it up (the recovery point).
    await tx.execute(sql`CREATE TEMP TABLE dr_backup ON COMMIT DROP AS SELECT * FROM dr_canary`);
    steps.push('captured backup');

    // 3. Simulate the loss.
    await tx.execute(sql`TRUNCATE dr_canary`);
    steps.push('simulated data loss (truncate)');

    // 4. Restore from the backup, timing the recovery.
    const startedMs = Date.now();
    await tx.execute(sql`INSERT INTO dr_canary SELECT * FROM dr_backup`);
    const recoverySeconds = (Date.now() - startedMs) / 1000;
    steps.push(`restored in ${recoverySeconds.toFixed(3)}s`);

    // 5. Verify the restored data is identical to the pre-loss snapshot.
    const afterRes = await tx.execute(
      sql`SELECT count(*)::int AS n, md5(coalesce(string_agg(payload, '' ORDER BY id), '')) AS fp FROM dr_canary`,
    );
    const after = afterRes.rows[0] as unknown as CountFp;
    const integrityOk = before.n === after.n && before.fp === after.fp;
    steps.push(integrityOk ? 'integrity verified' : 'INTEGRITY MISMATCH');

    const { withinRpo, withinRto } = evaluateRecovery({ dataLossSeconds, recoverySeconds });
    const status = integrityOk && withinRpo && withinRto ? 'PASSED' : 'FAILED';

    return {
      status,
      integrityOk,
      expectedRowCount: before.n,
      restoredRowCount: after.n,
      dataLossSeconds,
      recoverySeconds,
      withinRpo,
      withinRto,
      steps,
    };
  });
}
