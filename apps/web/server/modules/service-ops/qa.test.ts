import { fileURLToPath } from 'node:url';
import { eq, isNull, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderStatus, ScaleStatus } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import {
  conditions,
  orders,
  planSets,
  projects,
  serviceProfiles,
  sheets,
  sourceFiles,
  takeoffs,
  tradeCategories,
  users,
} from '../../data/schema';
import { accountsService } from '../accounts';
import { ordersService } from '../orders';
import { seedGlobalTradeData } from '../trades/seed';
import type { Actor } from '../orders';
import { qaService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
const estimatorActor: Actor = { userId: uuidv7(), role: 'SERVICE_ESTIMATOR' };
const qaActor: Actor = { userId: uuidv7(), role: 'SERVICE_QA' };
let estProfileId: string;
let qaProfileId: string;
let tradeA: string;
let tradeB: string;

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE order_events, orders, conditions, takeoffs, sheets, source_files, plan_sets, projects, condition_templates, trade_categories, service_profiles, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
  const cats = await admin.db.query.tradeCategories.findMany({
    where: isNull(tradeCategories.org_id),
  });
  tradeA = cats[0]!.id;
  tradeB = cats[1]!.id;
  estProfileId = await profile('SERVICE_ESTIMATOR');
  qaProfileId = await profile('SERVICE_QA');
});

afterAll(async () => {
  await admin.pool.end();
});

async function profile(role: 'SERVICE_ESTIMATOR' | 'SERVICE_QA'): Promise<string> {
  const [user] = await admin.db
    .insert(users)
    .values({ email: `${uuidv7()}@svc.test` })
    .returning();
  const [p] = await admin.db
    .insert(serviceProfiles)
    .values({ user_id: user!.id, role, active: true })
    .returning();
  return p!.id;
}

/** A fulfilled order ready for QA, with controllable sheet scale + condition/requested trades. */
async function fulfilledOrder(
  slug: string,
  opts: {
    status?: OrderStatus;
    sheetScale?: ScaleStatus;
    conditionTrades?: string[];
    requestedTrades?: string[];
  } = {},
): Promise<string> {
  const status = opts.status ?? 'IN_QA';
  const sheetScale = opts.sheetScale ?? 'CONFIRMED';
  const conditionTrades = opts.conditionTrades ?? [tradeA];
  const requestedTrades = opts.requestedTrades ?? [tradeA];

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
  const ps = (
    await admin.db
      .insert(planSets)
      .values({ org_id: orgId, project_id: project!.id, version_number: 1 })
      .returning()
  )[0]!;
  const sourceFileId = uuidv7();
  await admin.db.insert(sourceFiles).values({
    id: sourceFileId,
    org_id: orgId,
    plan_set_id: ps.id,
    original_filename: 'A.pdf',
    mime_type: 'application/pdf',
    byte_size: 1,
    checksum_sha256: 'a'.repeat(64),
    storage_key: `org/${orgId}/x`,
    upload_status: 'UPLOADED',
  });
  await admin.db.insert(sheets).values({
    org_id: orgId,
    plan_set_id: ps.id,
    source_file_id: sourceFileId,
    index_in_set: 0,
    unit_per_pixel: 0.5,
    scale_status: sheetScale,
    scale_units: 'IMPERIAL',
  });
  const [takeoff] = await admin.db
    .insert(takeoffs)
    .values({
      org_id: orgId,
      project_id: project!.id,
      plan_set_id: ps.id,
      origin: 'MANAGED_SERVICE',
    })
    .returning();
  for (const trade of conditionTrades) {
    await admin.db.insert(conditions).values({
      org_id: orgId,
      takeoff_id: takeoff!.id,
      trade_category_id: trade,
      name: 'Cond',
      measurement_type: 'AREA',
      unit: 'SF',
    });
  }
  const [order] = await admin.db
    .insert(orders)
    .values({
      org_id: orgId,
      project_id: project!.id,
      plan_set_id: ps.id,
      service_tier: 'FULL_PROJECT',
      requested_trades: requestedTrades,
      priority: 'STANDARD',
      status,
      assigned_estimator_id: estProfileId,
      delivered_takeoff_id: takeoff!.id,
    })
    .returning();
  return order!.id;
}

const getOrder = (id: string) => admin.db.query.orders.findFirst({ where: eq(orders.id, id) });
const PASS = { quantitiesSpotChecked: true, reportRenders: true };

describe('QA workflow (P3-06 gate)', () => {
  it('the estimator submits completed work: IN_PROGRESS → IN_QA', async () => {
    const orderId = await fulfilledOrder('submit', { status: 'IN_PROGRESS' });
    const order = await qaService.submitForQa(admin.db, orderId, estProfileId, estimatorActor);
    expect(order.status).toBe('IN_QA');
  });

  it('the checklist flags an unconfirmed-scale sheet and a missing requested trade', async () => {
    const passing = await fulfilledOrder('pass');
    expect(await qaService.checklist(admin.db, passing)).toMatchObject({
      scaleConfirmed: true,
      tradesCovered: true,
    });

    const badScale = await fulfilledOrder('badscale', { sheetScale: 'AUTO' });
    const c1 = await qaService.checklist(admin.db, badScale);
    expect(c1.scaleConfirmed).toBe(false);
    expect(c1.unconfirmedSheets).toHaveLength(1);

    const missing = await fulfilledOrder('missing', {
      conditionTrades: [tradeA],
      requestedTrades: [tradeA, tradeB],
    });
    const c2 = await qaService.checklist(admin.db, missing);
    expect(c2.tradesCovered).toBe(false);
    expect(c2.missingTrades).toEqual([tradeB]);
  });

  it('approval is blocked when the checklist fails, and the order is returned to the estimator', async () => {
    const orderId = await fulfilledOrder('fail', { sheetScale: 'AUTO' });
    await expect(
      qaService.approve(admin.db, orderId, qaProfileId, qaActor, PASS),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await getOrder(orderId))?.status).toBe('IN_QA'); // not delivered

    const returned = await qaService.returnToEstimator(
      admin.db,
      orderId,
      qaProfileId,
      qaActor,
      'Confirm the scale on sheet 1.',
    );
    expect(returned.status).toBe('REVISIONS');
    expect(returned.qa_reviewer_id).toBe(qaProfileId);
  });

  it('an approved order advances to DELIVERED with the checklist recorded', async () => {
    const orderId = await fulfilledOrder('approve');
    const delivered = await qaService.approve(admin.db, orderId, qaProfileId, qaActor, PASS);
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.qa_reviewer_id).toBe(qaProfileId);

    const events = await admin.db.transaction((tx) => ordersService.listEvents(tx, orderId));
    expect(events.at(-1)?.payload).toMatchObject({
      checklist: { scaleConfirmed: true, tradesCovered: true, quantitiesSpotChecked: true },
    });
  });

  it('the revisions loop preserves prior QA notes through another round', async () => {
    const orderId = await fulfilledOrder('loop');
    await qaService.returnToEstimator(
      admin.db,
      orderId,
      qaProfileId,
      qaActor,
      'First-round notes.',
    );
    // Estimator addresses it and resubmits, QA reviews again.
    await admin.db.transaction((tx) =>
      ordersService.transition(tx, orderId, 'IN_PROGRESS', estimatorActor),
    );
    await qaService.submitForQa(admin.db, orderId, estProfileId, estimatorActor);
    const delivered = await qaService.approve(admin.db, orderId, qaProfileId, qaActor, PASS);
    expect(delivered.status).toBe('DELIVERED');

    const events = await admin.db.transaction((tx) => ordersService.listEvents(tx, orderId));
    const notes = events.map((e) => (e.payload as { notes?: string }).notes).filter(Boolean);
    expect(notes).toContain('First-round notes.'); // prior context survives the loop
  });
});
