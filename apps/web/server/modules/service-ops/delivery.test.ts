import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderStatus } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { orders, projects } from '../../data/schema';
import { accountsService } from '../accounts';
import { ordersService, type Actor } from '../orders';
import { deliveryService } from './index';
import type { OrderNotice, OrderNotifier } from './notifier';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;
const customer: Actor = { userId: '11111111-1111-7111-8111-111111111111', role: 'OWNER' };

const HOUR = 3_600_000;

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE order_events, orders, projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

function recorder(): { notifier: OrderNotifier; calls: Record<string, OrderNotice[]> } {
  const calls: Record<string, OrderNotice[]> = { delivered: [], accepted: [], disputed: [] };
  return {
    calls,
    notifier: {
      delivered: (n) => void calls.delivered!.push(n),
      accepted: (n) => void calls.accepted!.push(n),
      disputed: (n) => void calls.disputed!.push(n),
    },
  };
}

async function makeOrder(
  slug: string,
  status: OrderStatus = 'DELIVERED',
  deliveredAt: Date | null = new Date(),
): Promise<{ orgId: string; orderId: string }> {
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
  const [order] = await admin.db
    .insert(orders)
    .values({
      org_id: orgId,
      project_id: project!.id,
      service_tier: 'FULL_PROJECT',
      requested_trades: [],
      priority: 'STANDARD',
      status,
      placed_at: new Date(Date.now() - 200 * HOUR),
      delivered_at: deliveredAt,
    })
    .returning();
  return { orgId, orderId: order!.id };
}

const getOrder = (id: string) => admin.db.query.orders.findFirst({ where: eq(orders.id, id) });
const events = (orgId: string, orderId: string) =>
  withOrgScope(app.db, orgId, (tx) => ordersService.listEvents(tx, orderId));

describe('delivery — acceptance, dispute, auto-accept (P3-07)', () => {
  it('the customer accepts a delivered order → ACCEPTED and is notified', async () => {
    const { orgId, orderId } = await makeOrder('accept');
    const rec = recorder();
    const accepted = await withOrgScope(app.db, orgId, (tx) =>
      deliveryService.accept(tx, orderId, customer, rec),
    );
    expect(accepted.status).toBe('ACCEPTED');
    expect(rec.calls.accepted).toHaveLength(1);
  });

  it('the customer disputes a delivered order → DISPUTED with the reason recorded', async () => {
    const { orgId, orderId } = await makeOrder('dispute');
    const rec = recorder();
    const disputed = await withOrgScope(app.db, orgId, (tx) =>
      deliveryService.dispute(tx, orderId, customer, 'Quantities look off on sheet 2', rec),
    );
    expect(disputed.status).toBe('DISPUTED');
    expect((await events(orgId, orderId)).at(-1)?.payload).toMatchObject({
      reason: 'Quantities look off on sheet 2',
    });
    expect(rec.calls.disputed).toHaveLength(1);
  });

  it('auto-accept fires only for orders past the dispute window', async () => {
    const expired = await makeOrder('expired', 'DELIVERED', new Date(Date.now() - 100 * HOUR)); // > 72h
    const fresh = await makeOrder('fresh', 'DELIVERED', new Date(Date.now() - 1 * HOUR)); // < 72h
    const rec = recorder();

    const acceptedIds = await deliveryService.autoAcceptExpired(admin.db, new Date(), rec);
    expect(acceptedIds).toContain(expired.orderId);
    expect(acceptedIds).not.toContain(fresh.orderId);
    expect((await getOrder(expired.orderId))?.status).toBe('ACCEPTED');
    expect((await getOrder(fresh.orderId))?.status).toBe('DELIVERED'); // still in window
    expect(rec.calls.accepted).toHaveLength(1);
  });

  it('only a delivered order can be accepted', async () => {
    const { orgId, orderId } = await makeOrder('early', 'IN_QA', null);
    await expect(
      withOrgScope(app.db, orgId, (tx) => deliveryService.accept(tx, orderId, customer)),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
