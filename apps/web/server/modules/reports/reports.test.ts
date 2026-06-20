import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EXPORT_QUEUE, type MeasurementGeometry } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { tradeCategories } from '../../data/schema';
import { enqueue } from '../../platform/queue';
import { S3Storage } from '../../storage/s3';
import { accountsService } from '../accounts';
import { conditionsService } from '../conditions';
import { getRollup } from '../measurements/rollup';
import { measurementsService } from '../measurements';
import { projectsRepo } from '../projects/repository';
import { takeoffsRepo } from '../takeoffs/repository';
import { seedGlobalTradeData } from '../trades/seed';
import { drainExportOne, generateReport, reportsService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

const storage = new S3Storage({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'takeoff-dev',
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'takeoff',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'takeoffdev',
  forcePathStyle: true,
});

let admin: DbHandle;
let app: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE reports, measurements, quantity_rollups, conditions, takeoffs, projects, condition_templates, trade_categories, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
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

async function setupTakeoff(slug: string): Promise<{ orgId: string; takeoffId: string }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;
  const takeoffId = await withOrgScope(app.db, orgId, async (tx) => {
    const project = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    const takeoff = await takeoffsRepo.insert(tx, { org_id: orgId, project_id: project.id });
    return takeoff.id;
  });
  return { orgId, takeoffId };
}

/** Add an AREA/SF condition (optionally priced) and a square measurement; returns the condition id. */
async function addPricedCondition(
  orgId: string,
  takeoffId: string,
  name: string,
  size: number,
  unitCostMinor?: number,
): Promise<string> {
  return withOrgScope(app.db, orgId, async (tx) => {
    const cat = await tx.query.tradeCategories.findFirst({
      where: eq(tradeCategories.division_code, '03'),
    });
    const condition = await conditionsService.create(tx, {
      takeoff_id: takeoffId,
      trade_category_id: cat!.id,
      name,
      measurement_type: 'AREA',
      unit: 'SF',
      ...(unitCostMinor !== undefined ? { unit_cost_minor: unitCostMinor } : {}),
    });
    await measurementsService.create(tx, {
      condition_id: condition.id,
      geometry: square(size),
      unit_per_pixel: UPP,
    });
    return condition.id;
  });
}

describe('report generation (P1-13)', () => {
  it('requestReport only queues — generation is a background job, not inline', async () => {
    const { orgId, takeoffId } = await setupTakeoff('queue');
    await addPricedCondition(orgId, takeoffId, 'Slab', 100);

    const report = await withOrgScope(app.db, orgId, (tx) =>
      reportsService.requestReport(tx, { takeoffId, template: 'SUMMARY' }),
    );
    expect(report.status).toBe('QUEUED');
    expect(report.storage_key).toBeNull(); // nothing rendered on the request path
  });

  it("a generated export's totals equal the authoritative rollups exactly (parity caveat)", async () => {
    const { orgId, takeoffId } = await setupTakeoff('parity');
    const slabId = await addPricedCondition(orgId, takeoffId, 'Slab', 100, 350); // 2500 SF @ $3.50
    const wallId = await addPricedCondition(orgId, takeoffId, 'Curb', 60, 1200); // 900 SF @ $12.00

    const report = await withOrgScope(app.db, orgId, (tx) =>
      reportsService.requestReport(tx, { takeoffId, template: 'SUMMARY' }),
    );
    const result = await generateReport(
      { db: app.db, storage },
      { reportId: report.id, takeoffId, orgId, template: 'SUMMARY' },
    );
    expect(result.status).toBe('READY');

    const stored = await withOrgScope(app.db, orgId, (tx) => reportsService.getById(tx, report.id));
    expect(stored?.status).toBe('READY');
    expect(stored?.storage_key).toBeTruthy();

    const csv = Buffer.from(await storage.getObject(stored!.storage_key!)).toString('utf8');
    const cells = csv.split('\n').map((l) => l.split(','));

    // Each condition's quantity cell equals its rollup base_quantity to full precision.
    const [slabRollup, wallRollup] = await withOrgScope(app.db, orgId, async (tx) => [
      await getRollup(tx, slabId),
      await getRollup(tx, wallId),
    ]);
    const byName = new Map(cells.slice(1, -1).map((r) => [r[0], r]));
    expect(byName.get('Slab')![4]).toBe(String(slabRollup!.base_quantity));
    expect(byName.get('Curb')![4]).toBe(String(wallRollup!.base_quantity));

    // The export's grand total equals the summed rollup extended cost — never recomputed.
    const totalMinor =
      (slabRollup!.extended_cost_minor ?? 0) + (wallRollup!.extended_cost_minor ?? 0);
    const totalRow = cells[cells.length - 1]!;
    expect(totalRow[0]).toBe('TOTAL');
    expect(totalRow[totalRow.length - 1]).toBe((totalMinor / 100).toFixed(2));

    await storage.deleteObject(stored!.storage_key!);
  });

  it('drains an enqueued export job end to end (producer → consumer)', async () => {
    const { orgId, takeoffId } = await setupTakeoff('drain');
    await addPricedCondition(orgId, takeoffId, 'Slab', 100, 350);

    const report = await withOrgScope(app.db, orgId, (tx) =>
      reportsService.requestReport(tx, { takeoffId, template: 'BY_TRADE' }),
    );
    await enqueue(EXPORT_QUEUE, { reportId: report.id, takeoffId, orgId, template: 'BY_TRADE' });

    const result = await drainExportOne({ db: app.db, storage });
    expect(result).toMatchObject({ status: 'READY' });

    const stored = await withOrgScope(app.db, orgId, (tx) => reportsService.getById(tx, report.id));
    expect(stored?.status).toBe('READY');
    if (stored?.storage_key) await storage.deleteObject(stored.storage_key);

    // Queue now empty → draining again is a no-op.
    expect(await drainExportOne({ db: app.db, storage })).toBeNull();
  });

  it('rejects MARKED_PLANS at request time (raster export not yet supported)', async () => {
    const { orgId, takeoffId } = await setupTakeoff('marked');
    await expect(
      withOrgScope(app.db, orgId, (tx) =>
        reportsService.requestReport(tx, { takeoffId, template: 'MARKED_PLANS' }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', field: 'template' });
  });

  it('generates a large takeoff (many conditions) without inlining the work', async () => {
    const { orgId, takeoffId } = await setupTakeoff('large');
    for (let i = 0; i < 25; i++) {
      await addPricedCondition(orgId, takeoffId, `Cond ${i}`, 10 + i, 100);
    }
    const report = await withOrgScope(app.db, orgId, (tx) =>
      reportsService.requestReport(tx, { takeoffId, template: 'DETAILED' }),
    );
    const result = await generateReport(
      { db: app.db, storage },
      { reportId: report.id, takeoffId, orgId, template: 'DETAILED' },
    );
    expect(result.status).toBe('READY');

    const stored = await withOrgScope(app.db, orgId, (tx) => reportsService.getById(tx, report.id));
    const csv = Buffer.from(await storage.getObject(stored!.storage_key!)).toString('utf8');
    // header + 25 condition rows + TOTAL.
    expect(csv.split('\n').length).toBe(1 + 25 + 1);
    await storage.deleteObject(stored!.storage_key!);
  });
});
