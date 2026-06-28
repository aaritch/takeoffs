import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderPriority, ServiceTier } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { accountsService } from '../accounts';
import type { PaymentAuthorizer } from '../payments';
import { retainerService } from '../payments';
import { seedGlobalPricingRules } from '../pricing';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo } from '../source-files/repository';
import { ordersService, type Actor } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;
const actor: Actor = { userId: uuidv7(), role: 'OWNER' };

const declining: PaymentAuthorizer = {
  async authorizeCharge() {
    return { ok: false, reason: 'Card declined' };
  },
};

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE retainer_ledger_entries, retainers, order_events, orders, plan_sets, projects, memberships, service_profiles, organizations, users, pricing_rules RESTART IDENTITY CASCADE`,
  );
  await seedGlobalPricingRules(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

/** An org with a QUOTED order of the given tier. Returns ids + the quoted amount. */
async function quotedOrder(
  slug: string,
  serviceTier: ServiceTier = 'FULL_PROJECT',
  priority: OrderPriority = 'STANDARD',
): Promise<{ orgId: string; orderId: string; amount: number }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;
  const orderId = await withOrgScope(app.db, orgId, async (tx) => {
    const project = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    const planSet = await planSetsRepo.insert(tx, {
      org_id: orgId,
      project_id: project.id,
      version_number: 1,
    });
    const order = await ordersService.create(
      tx,
      {
        projectId: project.id,
        planSetId: planSet.id,
        serviceTier,
        requestedTrades: [uuidv7()],
        priority,
      },
      actor,
    );
    return order.id;
  });
  const quoted = await withOrgScope(app.db, orgId, (tx) => ordersService.quote(tx, orderId, actor));
  return { orgId, orderId, amount: quoted.price_quote_minor! };
}

const get = (orgId: string, orderId: string) =>
  withOrgScope(app.db, orgId, (tx) => ordersService.getById(tx, orderId));

describe('order placement (P3-03)', () => {
  it('places a QUOTED order once payment is authorized, starting the SLA clock', async () => {
    const { orgId, orderId } = await quotedOrder('charge');
    const placed = await withOrgScope(app.db, orgId, (tx) =>
      ordersService.place(tx, orderId, actor),
    );
    expect(placed.status).toBe('PLACED');
    expect(placed.placed_at).not.toBeNull();

    const events = await withOrgScope(app.db, orgId, (tx) => ordersService.listEvents(tx, orderId));
    expect(events.at(-1)).toMatchObject({ to_status: 'PLACED' });
    expect(events.at(-1)!.payload).toMatchObject({ paymentMethod: 'CHARGE' });
  });

  it('a declined charge keeps the order QUOTED (out of the queue) and reports it', async () => {
    const { orgId, orderId } = await quotedOrder('declined');
    await expect(
      withOrgScope(app.db, orgId, (tx) =>
        ordersService.place(tx, orderId, actor, { authorizer: declining }),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED', message: 'Card declined' });

    expect((await get(orgId, orderId))?.status).toBe('QUOTED'); // never entered the queue
  });

  it('a RETAINER_DRAW order draws down the retainer balance and is placed', async () => {
    const { orgId, orderId, amount } = await quotedOrder('retainer', 'RETAINER_DRAW');
    await withOrgScope(app.db, orgId, (tx) => retainerService.topUp(tx, orgId, amount + 10000));

    const placed = await withOrgScope(app.db, orgId, (tx) =>
      ordersService.place(tx, orderId, actor),
    );
    expect(placed.status).toBe('PLACED');
    const retainer = await withOrgScope(app.db, orgId, (tx) => retainerService.getByOrg(tx, orgId));
    expect(retainer?.balance_minor).toBe(10000); // (amount + 10000) − amount
  });

  it('an insufficient retainer blocks placement and leaves the balance untouched', async () => {
    const { orgId, orderId, amount } = await quotedOrder('broke', 'RETAINER_DRAW');
    await withOrgScope(app.db, orgId, (tx) => retainerService.topUp(tx, orgId, amount - 1));

    await expect(
      withOrgScope(app.db, orgId, (tx) => ordersService.place(tx, orderId, actor)),
    ).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED' });

    expect((await get(orgId, orderId))?.status).toBe('QUOTED');
    const retainer = await withOrgScope(app.db, orgId, (tx) => retainerService.getByOrg(tx, orgId));
    expect(retainer?.balance_minor).toBe(amount - 1); // unchanged
  });

  it('refuses to place an order that has not been quoted', async () => {
    const orgId = (
      await accountsService.createOrganizationWithOwner(admin.db, {
        name: 'unquoted',
        slug: 'unquoted',
        owner: { email: 'unquoted@t.test' },
      })
    ).organization.id;
    const orderId = await withOrgScope(app.db, orgId, async (tx) => {
      const project = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
      const order = await ordersService.create(
        tx,
        {
          projectId: project.id,
          serviceTier: 'SINGLE_TRADE',
          requestedTrades: [],
          priority: 'STANDARD',
        },
        actor,
      );
      return order.id;
    });
    await expect(
      withOrgScope(app.db, orgId, (tx) => ordersService.place(tx, orderId, actor)),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
