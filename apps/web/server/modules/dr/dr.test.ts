import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import {
  RPO_TARGET_SECONDS,
  RTO_TARGET_SECONDS,
  drService,
  evaluateRecovery,
  runRestoreDrill,
} from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(sql`TRUNCATE dr_drill_runs RESTART IDENTITY`);
});

afterAll(async () => {
  await admin.pool.end();
});

describe('recovery objectives (pure, P5-01)', () => {
  it('passes within the RPO/RTO targets and flags a breach of either', () => {
    expect(evaluateRecovery({ dataLossSeconds: 60, recoverySeconds: 120 })).toEqual({
      withinRpo: true,
      withinRto: true,
    });
    expect(
      evaluateRecovery({ dataLossSeconds: RPO_TARGET_SECONDS + 1, recoverySeconds: 1 }),
    ).toMatchObject({
      withinRpo: false,
    });
    expect(
      evaluateRecovery({ dataLossSeconds: 1, recoverySeconds: RTO_TARGET_SECONDS + 1 }),
    ).toMatchObject({
      withinRto: false,
    });
  });
});

describe('DR restore drill (P5-01)', () => {
  it('restores from backup end to end and verifies integrity within objectives', async () => {
    const report = await runRestoreDrill(admin.db, { rows: 500 });

    expect(report.status).toBe('PASSED');
    expect(report.integrityOk).toBe(true);
    expect(report.restoredRowCount).toBe(500);
    expect(report.expectedRowCount).toBe(500);
    expect(report.withinRpo).toBe(true);
    expect(report.withinRto).toBe(true);
    expect(report.steps).toContain('integrity verified');
  });

  it('FAILS the drill when the data-loss window breaches the RPO', async () => {
    const report = await runRestoreDrill(admin.db, {
      rows: 50,
      simulatedDataLossSeconds: RPO_TARGET_SECONDS + 60, // last recovery point too stale
    });
    expect(report.integrityOk).toBe(true); // the restore itself worked...
    expect(report.withinRpo).toBe(false); // ...but the objective was missed
    expect(report.status).toBe('FAILED');
  });

  it('records each drill so the schedule is auditable', async () => {
    const { run } = await drService.runAndRecord(admin.db, { rows: 100 });
    expect(run.status).toBe('PASSED');

    const runs = await drService.listRuns(admin.db);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.id).toBe(run.id);
    expect(runs[0]!.integrity_ok).toBe(true);
  });
});
