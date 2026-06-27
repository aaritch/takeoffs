import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MeasurementGeometry, OrderStatus } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import {
  orders,
  projects,
  serviceProfiles,
  sheets,
  sourceFiles,
  takeoffs,
  tradeCategories,
  users,
} from '../../data/schema';
import { accountsService } from '../accounts';
import { conditionsService } from '../conditions';
import { getRollup } from '../measurements/rollup';
import { measurementsService } from '../measurements';
import { planSetsRepo } from '../source-files/repository';
import { seedGlobalTradeData } from '../trades/seed';
import type { Actor } from '../orders';
import { fulfillmentService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;
const actor: Actor = { userId: uuidv7(), role: 'SERVICE_ESTIMATOR' };

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE order_events, orders, measurements, quantity_rollups, conditions, takeoffs, sheets, source_files, plan_sets, projects, condition_templates, trade_categories, service_profiles, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

const square = (s: number): MeasurementGeometry => ({
  type: 'POLYGON',
  exterior: [
    { x: 0, y: 0 },
    { x: 0, y: s },
    { x: s, y: s },
    { x: s, y: 0 },
  ],
});

async function estimator(): Promise<string> {
  const [user] = await admin.db
    .insert(users)
    .values({ email: `${uuidv7()}@svc.test` })
    .returning();
  const [profile] = await admin.db
    .insert(serviceProfiles)
    .values({ user_id: user!.id, role: 'SERVICE_ESTIMATOR', active: true })
    .returning();
  return profile!.id;
}

/** An order in `status`, optionally assigned to `estimatorId`, with a plan set + one sheet. */
async function order(
  slug: string,
  status: OrderStatus,
  estimatorId: string | null,
): Promise<{ orgId: string; orderId: string; sheetId: string }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;
  const [project] = await admin.db
    .insert(projects)
    .values({ org_id: orgId, name: 'Bid' })
    .returning();
  const planSet = await withOrgScope(app.db, orgId, (tx) =>
    planSetsRepo.insert(tx, { org_id: orgId, project_id: project!.id, version_number: 1 }),
  );
  const sourceFileId = uuidv7();
  await admin.db.insert(sourceFiles).values({
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
  const [sheet] = await admin.db
    .insert(sheets)
    .values({
      org_id: orgId,
      plan_set_id: planSet.id,
      source_file_id: sourceFileId,
      index_in_set: 0,
      unit_per_pixel: 0.5,
      scale_status: 'CONFIRMED',
      scale_units: 'IMPERIAL',
    })
    .returning();
  const [row] = await admin.db
    .insert(orders)
    .values({
      org_id: orgId,
      project_id: project!.id,
      plan_set_id: planSet.id,
      service_tier: 'FULL_PROJECT',
      requested_trades: [],
      priority: 'STANDARD',
      status,
      assigned_estimator_id: estimatorId,
    })
    .returning();
  return { orgId, orderId: row!.id, sheetId: sheet!.id };
}

describe('fulfillment in the shared editor (P3-05)', () => {
  it('start creates a MANAGED_SERVICE takeoff linked to the order and moves it to IN_PROGRESS', async () => {
    const est = await estimator();
    const { orderId } = await order('start', 'ASSIGNED', est);

    const { order: updated, takeoffId } = await fulfillmentService.start(
      admin.db,
      orderId,
      est,
      actor,
    );
    expect(updated.status).toBe('IN_PROGRESS');
    expect(updated.delivered_takeoff_id).toBe(takeoffId);

    const takeoff = await admin.db.query.takeoffs.findFirst({ where: eq(takeoffs.id, takeoffId) });
    expect(takeoff?.origin).toBe('MANAGED_SERVICE');
    expect(takeoff?.plan_set_id).toBeTruthy();
  });

  it('the estimator completes a full takeoff using the STANDARD tools (no special editor)', async () => {
    const est = await estimator();
    const { orgId, orderId, sheetId } = await order('build', 'ASSIGNED', est);
    const { takeoffId } = await fulfillmentService.start(admin.db, orderId, est, actor);

    // Exactly the self-serve services — condition + measurement → authoritative rollup.
    const conditionId = await withOrgScope(app.db, orgId, async (tx) => {
      const cat = await tx.query.tradeCategories.findFirst({
        where: eq(tradeCategories.division_code, '03'),
      });
      const condition = await conditionsService.create(tx, {
        takeoff_id: takeoffId,
        trade_category_id: cat!.id,
        name: 'Slab',
        measurement_type: 'AREA',
        unit: 'SF',
      });
      await measurementsService.create(tx, {
        condition_id: condition.id,
        sheet_id: sheetId,
        geometry: square(100),
        unit_per_pixel: 0.5,
      });
      return condition.id;
    });

    const rollup = await withOrgScope(app.db, orgId, (tx) => getRollup(tx, conditionId));
    expect(rollup?.base_quantity).toBe(2500); // 100×100 px × 0.5² ft/px
  });

  it('isolation: an estimator cannot start an order assigned to someone else', async () => {
    const estA = await estimator();
    const estB = await estimator();
    const { orderId } = await order('iso', 'ASSIGNED', estA);
    await expect(fulfillmentService.start(admin.db, orderId, estB, actor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('isolation: an unassigned (PLACED) order cannot be started', async () => {
    const est = await estimator();
    const { orderId } = await order('placed', 'PLACED', null);
    await expect(fulfillmentService.start(admin.db, orderId, est, actor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
