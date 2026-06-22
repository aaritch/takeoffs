import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  MeasurementGeometry,
  ScoredCandidate,
  SheetInferenceResult,
} from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { accountsService } from '../accounts';
import { conditionsService } from '../conditions';
import { getRollup } from '../measurements/rollup';
import { measurementsRepo } from '../measurements';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo, sourceFilesRepo } from '../source-files/repository';
import { sheetsRepo } from '../ingestion';
import { takeoffsRepo } from '../takeoffs/repository';
import { seedGlobalTradeData } from '../trades/seed';
import { aiRunsService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE model_runs, measurements, quantity_rollups, conditions, takeoffs, reports, sheets, source_files, plan_sets, projects, condition_templates, trade_categories, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

const UPP = 0.5; // ft per normalized pixel
const square = (s: number): MeasurementGeometry => ({
  type: 'POLYGON',
  exterior: [
    { x: 0, y: 0 },
    { x: 0, y: s },
    { x: s, y: s },
    { x: s, y: 0 },
  ],
});

/** An AREA candidate whose REPORTED rawValue is deliberately bogus, to prove the server recomputes. */
function areaCandidate(): ScoredCandidate {
  return {
    geometry: square(100),
    objectClass: 'slab',
    measurementType: 'AREA',
    unit: 'SF',
    conditionKey: 'concrete:slab-on-grade',
    detectionConfidence: 0.8,
    rawValue: 99999, // bogus — server must ignore this
    aiConfidence: 0.81,
  };
}

function countCandidate(): ScoredCandidate {
  return {
    geometry: {
      type: 'POINT_GROUP',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    objectClass: 'door',
    measurementType: 'COUNT',
    unit: 'EA',
    conditionKey: 'openings:doors',
    detectionConfidence: 0.9,
    rawValue: 2,
    aiConfidence: 0.9,
  };
}

function result(
  modelRunId: string,
  sheetId: string,
  candidates: ScoredCandidate[],
  status: SheetInferenceResult['status'] = 'SUCCEEDED',
): SheetInferenceResult {
  return {
    modelRunId,
    sheetId,
    status,
    classification: null,
    scale: null,
    candidates,
    errorDetail: null,
  };
}

async function setupSheet(
  slug: string,
): Promise<{ orgId: string; planSetId: string; sheetId: string }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;

  return withOrgScope(app.db, orgId, async (tx) => {
    const project = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    const planSet = await planSetsRepo.insert(tx, {
      org_id: orgId,
      project_id: project.id,
      version_number: 1,
    });
    const sourceFileId = uuidv7();
    await sourceFilesRepo.insert(tx, {
      id: sourceFileId,
      org_id: orgId,
      plan_set_id: planSet.id,
      original_filename: 'A-101.pdf',
      mime_type: 'application/pdf',
      byte_size: 1,
      checksum_sha256: 'a'.repeat(64),
      storage_key: `org/${orgId}/x`,
      upload_status: 'UPLOADED',
    });
    const [sheet] = await sheetsRepo.insertMany(tx, [
      {
        org_id: orgId,
        plan_set_id: planSet.id,
        source_file_id: sourceFileId,
        index_in_set: 0,
        unit_per_pixel: UPP,
        scale_status: 'CONFIRMED',
        scale_units: 'IMPERIAL',
      },
    ]);
    return { orgId, planSetId: planSet.id, sheetId: sheet!.id };
  });
}

const liveBySheet = (orgId: string, sheetId: string) =>
  withOrgScope(app.db, orgId, (tx) => measurementsRepo.listBySheet(tx, sheetId));

describe('AI runs — ModelRun + candidate ingestion (P2-02/03 app core)', () => {
  it('startRun creates a QUEUED run with full version lineage', async () => {
    const { orgId, planSetId } = await setupSheet('start');
    const run = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.startRun(tx, {
        planSetId,
        trigger: 'USER_REQUESTED',
        pipelineVersion: 'p-1',
        modelVersions: { detector: '1.2.3' },
      }),
    );
    expect(run.status).toBe('QUEUED');
    expect(run.pipeline_version).toBe('p-1');
    expect(run.model_versions).toEqual({ detector: '1.2.3' });
    expect(run.candidate_count).toBe(0);
  });

  it('ingests candidates as UNREVIEWED AI measurements with server-recomputed quantities', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('ingest');
    const run = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.startRun(tx, { planSetId, pipelineVersion: 'p-1' }),
    );
    const count = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.ingestSheetResult(
        tx,
        result(run.id, sheetId, [areaCandidate(), countCandidate()]),
      ),
    );
    expect(count).toBe(2);

    const ms = await liveBySheet(orgId, sheetId);
    expect(ms).toHaveLength(2);
    expect(ms.every((m) => m.source === 'AI' && m.review_status === 'UNREVIEWED')).toBe(true);
    expect(ms.every((m) => m.model_run_id === run.id)).toBe(true);

    // Server recomputed raw_value from geometry + scale (10000 px² × 0.5² = 2500 sq ft), NOT the
    // candidate's bogus reported 99999.
    const area = ms.find((m) => m.geom_type === 'POLYGON')!;
    expect(area.raw_value).toBe(2500);
    expect(area.ai_confidence).toBe(0.81);

    // The run advanced to RUNNING and counted the candidates.
    const updated = await withOrgScope(app.db, orgId, (tx) => aiRunsService.getById(tx, run.id));
    expect(updated?.status).toBe('RUNNING');
    expect(updated?.candidate_count).toBe(2);
  });

  it('candidates do NOT move authoritative rollups until reviewed', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('rollup');
    const run = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.startRun(tx, { planSetId, pipelineVersion: 'p-1' }),
    );
    await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.ingestSheetResult(tx, result(run.id, sheetId, [areaCandidate()])),
    );
    // No rollup is computed for an UNREVIEWED candidate (rollups only sum ACCEPTED/EDITED).
    const noRollup = await withOrgScope(app.db, orgId, async (tx) => {
      const takeoffId = (await takeoffsRepo.firstForPlanSet(tx, planSetId))!.id;
      const [condition] = await conditionsService.list(tx, takeoffId);
      return getRollup(tx, condition!.id);
    });
    expect(noRollup).toBeUndefined();
  });

  it('re-running a sheet replaces its prior candidate set (no duplicates)', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('rerun');
    const run1 = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.startRun(tx, { planSetId, pipelineVersion: 'p-1' }),
    );
    await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.ingestSheetResult(
        tx,
        result(run1.id, sheetId, [areaCandidate(), countCandidate()]),
      ),
    );
    expect(await liveBySheet(orgId, sheetId)).toHaveLength(2);

    const run2 = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.startRun(tx, { planSetId, pipelineVersion: 'p-2' }),
    );
    await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.ingestSheetResult(tx, result(run2.id, sheetId, [areaCandidate()])),
    );

    const live = await liveBySheet(orgId, sheetId);
    expect(live).toHaveLength(1); // the prior 2 were replaced, not duplicated
    expect(live[0]!.model_run_id).toBe(run2.id);
  });

  it('preserves human-reviewed measurements across a re-run', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('review');
    const run1 = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.startRun(tx, { planSetId, pipelineVersion: 'p-1' }),
    );
    await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.ingestSheetResult(
        tx,
        result(run1.id, sheetId, [areaCandidate(), countCandidate()]),
      ),
    );
    // A reviewer accepts one candidate (a decision, not a candidate anymore).
    const accepted = (await liveBySheet(orgId, sheetId)).find((m) => m.geom_type === 'POLYGON')!;
    await withOrgScope(app.db, orgId, (tx) =>
      measurementsRepo.update(tx, accepted.id, { review_status: 'ACCEPTED' }),
    );

    const run2 = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.startRun(tx, { planSetId, pipelineVersion: 'p-2' }),
    );
    await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.ingestSheetResult(tx, result(run2.id, sheetId, [countCandidate()])),
    );

    const live = await liveBySheet(orgId, sheetId);
    // The accepted one survived; only the new candidate was added.
    expect(live.map((m) => m.id)).toContain(accepted.id);
    expect(live).toHaveLength(2);
  });

  it('finalizeRun marks a terminal status with error detail and finished_at', async () => {
    const { orgId, planSetId } = await setupSheet('final');
    const run = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.startRun(tx, { planSetId, pipelineVersion: 'p-1' }),
    );
    const finalized = await withOrgScope(app.db, orgId, (tx) =>
      aiRunsService.finalizeRun(tx, run.id, 'PARTIAL', 'sheet 2 stage SYMBOLS failed'),
    );
    expect(finalized.status).toBe('PARTIAL');
    expect(finalized.error_detail).toBe('sheet 2 stage SYMBOLS failed');
    expect(finalized.finished_at).not.toBeNull();
  });
});
