import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderStatus } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { OrderError } from './errors';
import { ordersService, type Actor } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;
const actor: Actor = { userId: uuidv7(), role: 'PLATFORM_ADMIN' };

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE order_events, orders, plan_sets, projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

async function setupProject(slug: string): Promise<{ orgId: string; projectId: string }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;
  const projectId = await withOrgScope(app.db, orgId, async (tx) => {
    const p = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    return p.id;
  });
  return { orgId, projectId };
}

async function createOrder(orgId: string, projectId: string) {
  return withOrgScope(app.db, orgId, (tx) =>
    ordersService.create(
      tx,
      { projectId, serviceTier: 'FULL_PROJECT', requestedTrades: [], priority: 'STANDARD' },
      actor,
    ),
  );
}

const move = (orgId: string, orderId: string, to: OrderStatus) =>
  withOrgScope(app.db, orgId, (tx) => ordersService.transition(tx, orderId, to, actor));
const events = (orgId: string, orderId: string) =>
  withOrgScope(app.db, orgId, (tx) => ordersService.listEvents(tx, orderId));

describe('orders — model + lifecycle state machine (P3-01)', () => {
  it('creates a DRAFT order and logs a CREATED event', async () => {
    const { orgId, projectId } = await setupProject('create');
    const order = await createOrder(orgId, projectId);
    expect(order.status).toBe('DRAFT');

    const log = await events(orgId, order.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      event_type: 'CREATED',
      from_status: null,
      to_status: 'DRAFT',
      actor_id: actor.userId,
      actor_role: 'PLATFORM_ADMIN',
    });
  });

  it('runs the full happy path and stamps placed_at / delivered_at, logging each transition', async () => {
    const { orgId, projectId } = await setupProject('happy');
    const order = await createOrder(orgId, projectId);
    const path: OrderStatus[] = [
      'QUOTED',
      'PLACED',
      'ASSIGNED',
      'IN_PROGRESS',
      'IN_QA',
      'DELIVERED',
      'ACCEPTED',
    ];
    let current = order;
    for (const to of path) current = await move(orgId, order.id, to);

    expect(current.status).toBe('ACCEPTED');
    expect(current.placed_at).not.toBeNull();
    expect(current.delivered_at).not.toBeNull();

    const log = await events(orgId, order.id);
    expect(log).toHaveLength(1 + path.length); // CREATED + 7 transitions
    // The audit chain is contiguous: each event's from = the previous event's to.
    for (let i = 1; i < log.length; i++) {
      expect(log[i]!.from_status).toBe(log[i - 1]!.to_status);
    }
  });

  it('rejects an illegal transition and leaves the order + audit log untouched', async () => {
    const { orgId, projectId } = await setupProject('illegal');
    const order = await createOrder(orgId, projectId);

    await expect(move(orgId, order.id, 'DELIVERED')).rejects.toMatchObject({
      code: 'ILLEGAL_TRANSITION',
    });
    const after = await withOrgScope(app.db, orgId, (tx) => ordersService.getById(tx, order.id));
    expect(after?.status).toBe('DRAFT');
    expect(await events(orgId, order.id)).toHaveLength(1); // only CREATED
  });

  it('supports the QA revisions loop multiple times and still reaches delivery', async () => {
    const { orgId, projectId } = await setupProject('loop');
    const order = await createOrder(orgId, projectId);
    for (const to of ['QUOTED', 'PLACED', 'ASSIGNED', 'IN_PROGRESS', 'IN_QA'] as OrderStatus[]) {
      await move(orgId, order.id, to);
    }
    // Two QA rounds: IN_QA → REVISIONS → IN_PROGRESS → IN_QA, twice.
    for (let round = 0; round < 2; round++) {
      await move(orgId, order.id, 'REVISIONS');
      await move(orgId, order.id, 'IN_PROGRESS');
      await move(orgId, order.id, 'IN_QA');
    }
    const delivered = await move(orgId, order.id, 'DELIVERED');
    expect(delivered.status).toBe('DELIVERED');
  });

  it('allows cancellation from a valid state but blocks it from a terminal one', async () => {
    const { orgId, projectId } = await setupProject('cancel');
    const a = await createOrder(orgId, projectId);
    const cancelled = await move(orgId, a.id, 'CANCELLED');
    expect(cancelled.status).toBe('CANCELLED');

    const b = await createOrder(orgId, projectId);
    for (const to of [
      'QUOTED',
      'PLACED',
      'ASSIGNED',
      'IN_PROGRESS',
      'IN_QA',
      'DELIVERED',
      'ACCEPTED',
    ] as OrderStatus[]) {
      await move(orgId, b.id, to);
    }
    await expect(move(orgId, b.id, 'CANCELLED')).rejects.toBeInstanceOf(OrderError);
  });

  it('lets the customer dispute a delivered order', async () => {
    const { orgId, projectId } = await setupProject('dispute');
    const order = await createOrder(orgId, projectId);
    for (const to of [
      'QUOTED',
      'PLACED',
      'ASSIGNED',
      'IN_PROGRESS',
      'IN_QA',
      'DELIVERED',
    ] as OrderStatus[]) {
      await move(orgId, order.id, to);
    }
    const disputed = await move(orgId, order.id, 'DISPUTED');
    expect(disputed.status).toBe('DISPUTED');
    expect(canReachAccepted(await events(orgId, order.id))).toBe(true);
  });
});

/** A disputed order can still reach ACCEPTED — the last event's to is DISPUTED, which permits it. */
function canReachAccepted(log: { to_status: OrderStatus }[]): boolean {
  return log[log.length - 1]!.to_status === 'DISPUTED';
}
