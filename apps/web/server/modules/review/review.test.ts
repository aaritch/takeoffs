import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
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
import { tradeCategories } from '../../data/schema';
import { accountsService } from '../accounts';
import { aiRunsService } from '../ai-runs';
import { conditionsService } from '../conditions';
import { getRollup } from '../measurements/rollup';
import { measurementsRepo, type Measurement } from '../measurements';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo, sourceFilesRepo } from '../source-files/repository';
import { sheetsRepo } from '../ingestion';
import { takeoffsRepo } from '../takeoffs/repository';
import { seedGlobalTradeData } from '../trades/seed';
import { detectionFeedbackRepo, reviewService, type Actor } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;
const actor: Actor = { userId: uuidv7(), role: 'ESTIMATOR_MEMBER' };

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE detection_feedback, model_runs, measurements, quantity_rollups, conditions, takeoffs, sheets, source_files, plan_sets, projects, condition_templates, trade_categories, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

const UPP = 0.5;
const square = (s: number): MeasurementGeometry => ({
  type: 'POLYGON',
  exterior: [
    { x: 0, y: 0 },
    { x: 0, y: s },
    { x: s, y: s },
    { x: s, y: 0 },
  ],
});

function slabCandidate(size: number, confidence: number): ScoredCandidate {
  return {
    geometry: square(size),
    objectClass: 'slab',
    measurementType: 'AREA',
    unit: 'SF',
    conditionKey: 'concrete:slab',
    detectionConfidence: confidence,
    rawValue: 0,
    aiConfidence: confidence,
  };
}
function doorCandidate(): ScoredCandidate {
  return {
    geometry: { type: 'POINT', point: { x: 5, y: 5 } },
    objectClass: 'door',
    measurementType: 'COUNT',
    unit: 'EA',
    conditionKey: 'openings:doors',
    detectionConfidence: 0.9,
    rawValue: 1,
    aiConfidence: 0.9,
  };
}
const result = (
  modelRunId: string,
  sheetId: string,
  candidates: ScoredCandidate[],
): SheetInferenceResult => ({
  modelRunId,
  sheetId,
  status: 'SUCCEEDED',
  classification: null,
  scale: null,
  candidates,
  errorDetail: null,
});

async function setupSheet(
  slug: string,
): Promise<{ orgId: string; planSetId: string; sheetId: string }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
      planTier: 'PRO', // AI takeoff runs are a paid entitlement (P4-02 quota); FREE excludes them.
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
      original_filename: 'A.pdf',
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

/** Ingest a candidate set under a fresh run; return the live measurements + ids. */
async function ingest(
  orgId: string,
  planSetId: string,
  sheetId: string,
  candidates: ScoredCandidate[],
): Promise<{ runId: string; live: Measurement[] }> {
  const run = await withOrgScope(app.db, orgId, (tx) =>
    aiRunsService.startRun(tx, { planSetId, pipelineVersion: 'p-1' }),
  );
  await withOrgScope(app.db, orgId, (tx) =>
    aiRunsService.ingestSheetResult(tx, result(run.id, sheetId, candidates)),
  );
  const live = await withOrgScope(app.db, orgId, (tx) => measurementsRepo.listBySheet(tx, sheetId));
  return { runId: run.id, live };
}

const rollupOf = (orgId: string, conditionId: string) =>
  withOrgScope(app.db, orgId, (tx) => getRollup(tx, conditionId));
const feedbackOf = (orgId: string, measurementId: string) =>
  withOrgScope(app.db, orgId, (tx) => detectionFeedbackRepo.listByMeasurement(tx, measurementId));

describe('candidate review actions + feedback (P2-10 / P2-11 gate)', () => {
  it('accept promotes a candidate into the authoritative rollup and logs ACCEPT feedback', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('accept');
    const { runId, live } = await ingest(orgId, planSetId, sheetId, [slabCandidate(100, 0.81)]);
    const slab = live[0]!;
    expect(await rollupOf(orgId, slab.condition_id)).toBeUndefined(); // UNREVIEWED → no rollup yet

    const view = await withOrgScope(app.db, orgId, (tx) =>
      reviewService.accept(tx, slab.id, actor),
    );
    expect(view.reviewStatus).toBe('ACCEPTED');

    expect((await rollupOf(orgId, slab.condition_id))?.base_quantity).toBe(2500);
    const fb = await feedbackOf(orgId, slab.id);
    expect(fb).toHaveLength(1);
    expect(fb[0]).toMatchObject({
      action: 'ACCEPT',
      model_run_id: runId,
      actor_user_id: actor.userId,
      actor_role: 'ESTIMATOR_MEMBER',
    });
  });

  it('reject excludes a candidate and logs REJECT feedback', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('reject');
    const { live } = await ingest(orgId, planSetId, sheetId, [slabCandidate(100, 0.81)]);
    const slab = live[0]!;
    const view = await withOrgScope(app.db, orgId, (tx) =>
      reviewService.reject(tx, slab.id, actor),
    );
    expect(view.reviewStatus).toBe('REJECTED');
    expect((await rollupOf(orgId, slab.condition_id))?.base_quantity).toBe(0);
    expect((await feedbackOf(orgId, slab.id))[0]?.action).toBe('REJECT');
  });

  it('edit-geometry recomputes the quantity and logs before/after', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('edit');
    const { live } = await ingest(orgId, planSetId, sheetId, [slabCandidate(100, 0.81)]);
    const slab = live[0]!;
    const view = await withOrgScope(app.db, orgId, (tx) =>
      reviewService.editGeometry(tx, slab.id, square(50), actor),
    );
    expect(view.reviewStatus).toBe('EDITED');
    expect(view.source).toBe('AI_EDITED');
    // 50×50 px × 0.5² = 625 sq ft.
    expect((await rollupOf(orgId, slab.condition_id))?.base_quantity).toBe(625);
    const fb = (await feedbackOf(orgId, slab.id))[0]!;
    expect(fb.action).toBe('EDIT_GEOMETRY');
    expect(fb.before_geometry).toEqual(square(100));
    expect(fb.after_geometry).toEqual(square(50));
  });

  it('reclassify moves the measurement and logs from/to class, updating both rollups', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('recl');
    const { live } = await ingest(orgId, planSetId, sheetId, [slabCandidate(100, 0.81)]);
    const slab = live[0]!;
    const targetId = await withOrgScope(app.db, orgId, async (tx) => {
      const takeoffId = (await takeoffsRepo.firstForPlanSet(tx, planSetId))!.id;
      const cat = await tx.query.tradeCategories.findFirst({
        where: eq(tradeCategories.division_code, '03'),
      });
      const c = await conditionsService.create(tx, {
        takeoff_id: takeoffId,
        trade_category_id: cat!.id,
        name: 'Topping Slab',
        measurement_type: 'AREA',
        unit: 'SF',
        ai_object_class: 'topping',
      });
      return c.id;
    });

    const view = await withOrgScope(app.db, orgId, (tx) =>
      reviewService.reclassify(tx, slab.id, targetId, actor),
    );
    expect(view.conditionId).toBe(targetId);
    const fb = (await feedbackOf(orgId, slab.id))[0]!;
    expect(fb).toMatchObject({ action: 'RECLASSIFY', from_class: 'slab', to_class: 'topping' });
  });

  it('add-missed creates a MANUAL accepted measurement and logs ADD_MISSED', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('missed');
    const { live } = await ingest(orgId, planSetId, sheetId, [slabCandidate(100, 0.81)]);
    const conditionId = live[0]!.condition_id;
    const view = await withOrgScope(app.db, orgId, (tx) =>
      reviewService.addMissed(tx, { conditionId, sheetId, geometry: square(40) }, actor),
    );
    expect(view.source).toBe('MANUAL');
    expect(view.reviewStatus).toBe('ACCEPTED');
    const fb = (await feedbackOf(orgId, view.id))[0]!;
    expect(fb.action).toBe('ADD_MISSED');
    expect(fb.after_geometry).toEqual(square(40));
  });

  it('bulk-accept promotes only candidates at/above the confidence, one feedback each', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('bulk');
    // Two slab candidates (same condition) at 0.9 and 0.5.
    const { live } = await ingest(orgId, planSetId, sheetId, [
      slabCandidate(100, 0.9),
      slabCandidate(60, 0.5),
    ]);
    const conditionId = live[0]!.condition_id;
    const accepted = await withOrgScope(app.db, orgId, (tx) =>
      reviewService.bulkAcceptByConfidence(tx, conditionId, 0.8, actor),
    );
    expect(accepted).toBe(1);

    const after = await withOrgScope(app.db, orgId, (tx) =>
      measurementsRepo.listBySheet(tx, sheetId),
    );
    const statuses = after.map((m) => m.review_status).sort();
    expect(statuses).toEqual(['ACCEPTED', 'UNREVIEWED']);
    // Only the 0.9 candidate (2500 sq ft) counts toward the rollup.
    expect((await rollupOf(orgId, conditionId))?.base_quantity).toBe(2500);
  });

  it('GATE: every review action writes exactly one feedback row — nothing dropped', async () => {
    const { orgId, planSetId, sheetId } = await setupSheet('gate');
    const { live } = await ingest(orgId, planSetId, sheetId, [
      slabCandidate(100, 0.81),
      doorCandidate(),
    ]);
    const slab = live.find((m) => m.geom_type === 'POLYGON')!;
    const door = live.find((m) => m.geom_type === 'POINT')!;

    await withOrgScope(app.db, orgId, (tx) => reviewService.accept(tx, slab.id, actor));
    await withOrgScope(app.db, orgId, (tx) => reviewService.reject(tx, door.id, actor));
    const missed = await withOrgScope(app.db, orgId, (tx) =>
      reviewService.addMissed(
        tx,
        { conditionId: slab.condition_id, sheetId, geometry: square(30) },
        actor,
      ),
    );

    // 3 actions → 3 feedback rows, each with complete provenance (action + actor + measurement).
    const rows = await withOrgScope(app.db, orgId, async (tx) => [
      ...(await detectionFeedbackRepo.listByMeasurement(tx, slab.id)),
      ...(await detectionFeedbackRepo.listByMeasurement(tx, door.id)),
      ...(await detectionFeedbackRepo.listByMeasurement(tx, missed.id)),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.action).sort()).toEqual(['ACCEPT', 'ADD_MISSED', 'REJECT']);
    expect(rows.every((r) => r.actor_user_id === actor.userId && r.measurement_id)).toBe(true);
  });
});
