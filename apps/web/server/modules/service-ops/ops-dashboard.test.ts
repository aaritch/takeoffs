import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderStatus } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { orders, projects, serviceProfiles, users } from '../../data/schema';
import { accountsService } from '../accounts';
import type { Order } from '../orders/repository';
import { computeSla, opsDashboardService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));
const HOUR = 3_600_000;

let admin: DbHandle;

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

// --- Pure SLA evaluation ---------------------------------------------------------

const PLACED = new Date('2026-01-01T00:00:00.000Z');
const slaOrder = (over: Partial<Order> = {}): Order =>
  ({ placed_at: PLACED, promised_turnaround_hours: 48, delivered_at: null, ...over }) as Order;

describe('computeSla (P3-08, pure)', () => {
  it('ON_TRACK early, AT_RISK in the final quarter, BREACHED past the deadline', () => {
    expect(computeSla(slaOrder(), new Date(PLACED.getTime() + 1 * HOUR)).status).toBe('ON_TRACK');
    expect(computeSla(slaOrder(), new Date(PLACED.getTime() + 37 * HOUR)).status).toBe('AT_RISK'); // riskAt = 36h
    expect(computeSla(slaOrder(), new Date(PLACED.getTime() + 49 * HOUR)).status).toBe('BREACHED');
  });

  it('records MET / LATE once delivered', () => {
    expect(
      computeSla(slaOrder({ delivered_at: new Date(PLACED.getTime() + 24 * HOUR) }), new Date())
        .status,
    ).toBe('MET');
    expect(
      computeSla(slaOrder({ delivered_at: new Date(PLACED.getTime() + 72 * HOUR) }), new Date())
        .status,
    ).toBe('LATE');
  });

  it('is NONE without a placed_at or a promised turnaround', () => {
    expect(computeSla(slaOrder({ placed_at: null }), new Date()).status).toBe('NONE');
    expect(computeSla(slaOrder({ promised_turnaround_hours: null }), new Date()).status).toBe(
      'NONE',
    );
  });
});

// --- DB: queue + estimator load --------------------------------------------------

async function org(slug: string): Promise<{ orgId: string; projectId: string }> {
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

async function placeOrder(
  ids: { orgId: string; projectId: string },
  status: OrderStatus,
  opts: { placedAt?: Date; turnaround?: number } = {},
): Promise<string> {
  const [order] = await admin.db
    .insert(orders)
    .values({
      org_id: ids.orgId,
      project_id: ids.projectId,
      service_tier: 'FULL_PROJECT',
      requested_trades: [],
      priority: 'STANDARD',
      status,
      placed_at: opts.placedAt ?? new Date(),
      promised_turnaround_hours: opts.turnaround ?? 48,
    })
    .returning();
  return order!.id;
}

async function estimator(currentLoad: number, max: number): Promise<string> {
  const [user] = await admin.db
    .insert(users)
    .values({ email: `${uuidv7()}@svc.test` })
    .returning();
  const [p] = await admin.db
    .insert(serviceProfiles)
    .values({
      user_id: user!.id,
      role: 'SERVICE_ESTIMATOR',
      active: true,
      current_capacity: currentLoad,
      max_concurrent_orders: max,
    })
    .returning();
  return p!.id;
}

describe('ops dashboard (P3-08, DB)', () => {
  it('the queue lists every non-terminal order (cross-org) and omits terminal ones', async () => {
    const a = await org('qa');
    const b = await org('qb');
    const active = await placeOrder(a, 'IN_PROGRESS');
    await placeOrder(b, 'ACCEPTED'); // terminal → excluded
    await placeOrder(b, 'CANCELLED'); // terminal → excluded
    const inQa = await placeOrder(a, 'IN_QA');

    const queue = await opsDashboardService.queue(admin.db, new Date());
    const ids = queue.map((q) => q.id);
    expect(ids).toContain(active);
    expect(ids).toContain(inQa);
    expect(queue).toHaveLength(2);
  });

  it('flags + escalates an order approaching or past its SLA', async () => {
    const a = await org('sla');
    const breached = await placeOrder(a, 'IN_PROGRESS', {
      placedAt: new Date(Date.now() - 100 * HOUR),
      turnaround: 48,
    });
    const onTrack = await placeOrder(a, 'IN_PROGRESS', { placedAt: new Date(), turnaround: 48 });

    const queue = await opsDashboardService.queue(admin.db, new Date());
    const byId = new Map(queue.map((q) => [q.id, q]));
    expect(byId.get(breached)).toMatchObject({ slaStatus: 'BREACHED', escalated: true });
    expect(byId.get(onTrack)).toMatchObject({ slaStatus: 'ON_TRACK', escalated: false });
  });

  it('reports accurate per-estimator capacity load', async () => {
    const under = await estimator(2, 5);
    const full = await estimator(5, 5);

    const load = await opsDashboardService.estimatorLoad(admin.db);
    const byId = new Map(load.map((e) => [e.profileId, e]));
    expect(byId.get(under)).toMatchObject({ currentLoad: 2, maxConcurrent: 5, available: true });
    expect(byId.get(full)).toMatchObject({ currentLoad: 5, maxConcurrent: 5, available: false });
  });
});
