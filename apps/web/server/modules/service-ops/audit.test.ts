import { fileURLToPath } from 'node:url';
import { eq, isNull, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import {
  conditions,
  orderEvents,
  planSets,
  projects,
  serviceProfiles,
  sheets,
  sourceFiles,
  tradeCategories,
  users,
} from '../../data/schema';
import type { OrderEvent } from '../orders/repository';
import { accountsService } from '../accounts';
import { isCompleteAuditEvent, isContiguousAuditTrail, ordersService, type Actor } from '../orders';
import { seedGlobalPricingRules } from '../pricing';
import { seedGlobalTradeData } from '../trades/seed';
import { assignmentService, deliveryService, fulfillmentService, qaService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;
let tradeA: string;

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE order_events, orders, conditions, takeoffs, sheets, source_files, plan_sets, projects, condition_templates, trade_categories, pricing_rules, service_profiles, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
  await seedGlobalPricingRules(admin.db);
  const cats = await admin.db.query.tradeCategories.findMany({
    where: isNull(tradeCategories.org_id),
  });
  tradeA = cats[0]!.id;
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

async function profile(
  role: 'SERVICE_ESTIMATOR' | 'SERVICE_QA',
  specialties: string[] = [],
): Promise<string> {
  const [user] = await admin.db
    .insert(users)
    .values({ email: `${uuidv7()}@svc.test` })
    .returning();
  const [p] = await admin.db
    .insert(serviceProfiles)
    .values({ user_id: user!.id, role, active: true, trade_specialties: specialties })
    .returning();
  return p!.id;
}

/** An org with a project, plan set, and one confirmed-scale sheet — enough to quote and QA. */
async function customerProject(
  slug: string,
): Promise<{ orgId: string; projectId: string; planSetId: string }> {
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
  const [planSet] = await admin.db
    .insert(planSets)
    .values({ org_id: orgId, project_id: project!.id, version_number: 1 })
    .returning();
  const sourceFileId = uuidv7();
  await admin.db.insert(sourceFiles).values({
    id: sourceFileId,
    org_id: orgId,
    plan_set_id: planSet!.id,
    original_filename: 'A.pdf',
    mime_type: 'application/pdf',
    byte_size: 1,
    checksum_sha256: 'a'.repeat(64),
    storage_key: `org/${orgId}/x`,
    upload_status: 'UPLOADED',
  });
  await admin.db.insert(sheets).values({
    org_id: orgId,
    plan_set_id: planSet!.id,
    source_file_id: sourceFileId,
    index_in_set: 0,
    unit_per_pixel: 0.5,
    scale_status: 'CONFIRMED',
    scale_units: 'IMPERIAL',
  });
  return { orgId, projectId: project!.id, planSetId: planSet!.id };
}

const ev = (from: string | null, to: string): OrderEvent =>
  ({
    event_type: 'T',
    from_status: from,
    to_status: to,
    actor_id: 'a',
    actor_role: 'r',
  }) as unknown as OrderEvent;

describe('order audit trail (P3-09)', () => {
  it('a full order journey produces a coherent, gap-free, complete event history', async () => {
    const { orgId, projectId, planSetId } = await customerProject('journey');
    const customer: Actor = { userId: uuidv7(), role: 'OWNER' };
    const estProfileId = await profile('SERVICE_ESTIMATOR', [tradeA]);
    const qaProfileId = await profile('SERVICE_QA');
    const estActor: Actor = { userId: uuidv7(), role: 'SERVICE_ESTIMATOR' };
    const adminActor: Actor = { userId: uuidv7(), role: 'PLATFORM_ADMIN' };
    const qaActor: Actor = { userId: uuidv7(), role: 'SERVICE_QA' };

    // create → quote → place (customer, org-scoped via RLS)
    const order = await withOrgScope(app.db, orgId, (tx) =>
      ordersService.create(
        tx,
        {
          projectId,
          planSetId,
          serviceTier: 'FULL_PROJECT',
          requestedTrades: [tradeA],
          priority: 'STANDARD',
        },
        customer,
      ),
    );
    const orderId = order.id;
    await withOrgScope(app.db, orgId, (tx) => ordersService.quote(tx, orderId, customer));
    await withOrgScope(app.db, orgId, (tx) => ordersService.place(tx, orderId, customer));

    // assign → start → submit QA → approve (platform staff, cross-org admin connection)
    await assignmentService.autoAssign(admin.db, orderId, adminActor);
    const { takeoffId } = await fulfillmentService.start(admin.db, orderId, estProfileId, estActor);
    // The estimator builds a condition covering the requested trade so QA's checklist passes.
    await admin.db.insert(conditions).values({
      org_id: orgId,
      takeoff_id: takeoffId,
      trade_category_id: tradeA,
      name: 'Slab',
      measurement_type: 'AREA',
      unit: 'SF',
    });
    await qaService.submitForQa(admin.db, orderId, estProfileId, estActor);
    await qaService.approve(admin.db, orderId, qaProfileId, qaActor, {
      quantitiesSpotChecked: true,
      reportRenders: true,
    });

    // accept (customer)
    await withOrgScope(app.db, orgId, (tx) => deliveryService.accept(tx, orderId, customer));

    const events = await admin.db.transaction((tx) => ordersService.listEvents(tx, orderId));
    expect(events.map((e) => e.to_status)).toEqual([
      'DRAFT',
      'QUOTED',
      'PLACED',
      'ASSIGNED',
      'IN_PROGRESS',
      'IN_QA',
      'DELIVERED',
      'ACCEPTED',
    ]);
    expect(isContiguousAuditTrail(events)).toBe(true); // gap-free: every from = the prior to
    expect(events.every(isCompleteAuditEvent)).toBe(true); // each has action + to-status + actor + role
  });

  it('events are immutable — UPDATE and DELETE are rejected at the database', async () => {
    const { orgId, projectId } = await customerProject('immutable');
    const created = await withOrgScope(app.db, orgId, (tx) =>
      ordersService.create(
        tx,
        { projectId, serviceTier: 'SINGLE_TRADE', requestedTrades: [], priority: 'STANDARD' },
        { userId: uuidv7(), role: 'OWNER' },
      ),
    );
    const [event] = await admin.db.query.orderEvents.findMany({
      where: eq(orderEvents.order_id, created.id),
    });

    await expect(
      admin.db
        .update(orderEvents)
        .set({ actor_role: 'TAMPERED' })
        .where(eq(orderEvents.id, event!.id)),
    ).rejects.toThrow(/append-only/);
    await expect(admin.db.delete(orderEvents).where(eq(orderEvents.id, event!.id))).rejects.toThrow(
      /append-only/,
    );
  });

  it('isContiguousAuditTrail + isCompleteAuditEvent (pure)', () => {
    expect(isContiguousAuditTrail([ev(null, 'DRAFT'), ev('DRAFT', 'QUOTED')])).toBe(true);
    expect(isContiguousAuditTrail([ev(null, 'DRAFT'), ev('PLACED', 'ASSIGNED')])).toBe(false); // gap
    expect(isContiguousAuditTrail([ev('DRAFT', 'QUOTED')])).toBe(false); // doesn't open at null
    expect(isContiguousAuditTrail([])).toBe(false);

    expect(isCompleteAuditEvent(ev(null, 'DRAFT'))).toBe(true);
    expect(isCompleteAuditEvent({ ...ev(null, 'DRAFT'), actor_id: null } as OrderEvent)).toBe(
      false,
    );
  });
});
