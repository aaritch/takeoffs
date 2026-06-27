import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { orders, projects, serviceProfiles, users } from '../../data/schema';
import { accountsService } from '../accounts';
import type { Actor } from '../orders';
import { assignmentService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
const actor: Actor = { userId: uuidv7(), role: 'PLATFORM_ADMIN' };

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE order_events, orders, projects, service_profiles, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
});

/** A platform estimator (no org) with the given specialties + capacity. Returns the profile id. */
async function estimator(specialties: string[], maxConcurrent = 5, active = true): Promise<string> {
  const [user] = await admin.db
    .insert(users)
    .values({ email: `${uuidv7()}@svc.test` })
    .returning();
  const [profile] = await admin.db
    .insert(serviceProfiles)
    .values({
      user_id: user!.id,
      role: 'SERVICE_ESTIMATOR',
      trade_specialties: specialties,
      active,
      max_concurrent_orders: maxConcurrent,
    })
    .returning();
  return profile!.id;
}

async function setupOrg(slug: string): Promise<{ orgId: string; projectId: string }> {
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
  return { orgId, projectId: project!.id };
}

async function placedOrder(
  orgId: string,
  projectId: string,
  requestedTrades: string[] = [],
): Promise<string> {
  const [order] = await admin.db
    .insert(orders)
    .values({
      org_id: orgId,
      project_id: projectId,
      service_tier: 'FULL_PROJECT',
      requested_trades: requestedTrades,
      priority: 'STANDARD',
      status: 'PLACED',
      placed_at: new Date(),
    })
    .returning();
  return order!.id;
}

const getOrder = (id: string) => admin.db.query.orders.findFirst({ where: eq(orders.id, id) });
const getProfile = (id: string) =>
  admin.db.query.serviceProfiles.findFirst({ where: eq(serviceProfiles.id, id) });

describe('estimator assignment & capacity (P3-04)', () => {
  it('auto-assigns a PLACED order to an eligible, under-capacity, matching estimator', async () => {
    const trade = uuidv7();
    const est = await estimator([trade]);
    const { orgId, projectId } = await setupOrg('match');
    const orderId = await placedOrder(orgId, projectId, [trade]);

    const result = await assignmentService.autoAssign(admin.db, orderId, actor);
    expect(result).toEqual({ assigned: true, estimatorId: est });

    const order = await getOrder(orderId);
    expect(order?.status).toBe('ASSIGNED');
    expect(order?.assigned_estimator_id).toBe(est);
    expect((await getProfile(est))?.current_capacity).toBe(1);
  });

  it('when no estimator matches the trades, the order waits in PLACED rather than failing', async () => {
    await estimator([uuidv7()]); // specializes in something else
    const { orgId, projectId } = await setupOrg('nomatch');
    const orderId = await placedOrder(orgId, projectId, [uuidv7()]);

    const result = await assignmentService.autoAssign(admin.db, orderId, actor);
    expect(result.assigned).toBe(false);
    expect((await getOrder(orderId))?.status).toBe('PLACED');
  });

  it('excludes an estimator already at capacity', async () => {
    const trade = uuidv7();
    await estimator([trade], 1); // the only estimator, capacity of 1
    const { orgId, projectId } = await setupOrg('full');
    const first = await placedOrder(orgId, projectId, [trade]);
    await assignmentService.autoAssign(admin.db, first, actor); // est now holds 1 active order

    const second = await placedOrder(orgId, projectId, [trade]);
    const result = await assignmentService.autoAssign(admin.db, second, actor);
    expect(result.assigned).toBe(false);
    expect((await getOrder(second))?.status).toBe('PLACED');
  });

  it('reassign moves the order and updates capacity on both estimators', async () => {
    const trade = uuidv7();
    const estA = await estimator([trade]);
    const estB = await estimator([trade]);
    const { orgId, projectId } = await setupOrg('reassign');
    const orderId = await placedOrder(orgId, projectId, [trade]);

    await assignmentService.reassign(admin.db, orderId, estA, actor); // PLACED → ASSIGNED on A
    expect((await getProfile(estA))?.current_capacity).toBe(1);

    await assignmentService.reassign(admin.db, orderId, estB, actor);
    expect((await getOrder(orderId))?.assigned_estimator_id).toBe(estB);
    expect((await getProfile(estA))?.current_capacity).toBe(0);
    expect((await getProfile(estB))?.current_capacity).toBe(1);
  });

  it('isolation: an estimator may access only the orders assigned to them', async () => {
    const trade = uuidv7();
    const estA = await estimator([trade]);
    const estB = await estimator([trade]);
    const { orgId, projectId } = await setupOrg('iso');
    const orderId = await placedOrder(orgId, projectId, [trade]);
    await assignmentService.reassign(admin.db, orderId, estA, actor);
    const order = (await getOrder(orderId))!;

    expect(() => assignmentService.assertEstimatorCanAccessOrder(order, estA)).not.toThrow();
    expect(() => assignmentService.assertEstimatorCanAccessOrder(order, estB)).toThrow(
      /not assigned/,
    );
  });
});
