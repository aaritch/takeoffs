import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderStatus } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { orders, projects, serviceProfiles, users } from '../../data/schema';
import { accountsService } from '../accounts';
import { deliveryService } from './delivery';
import { computePayoutAmount, ESTIMATOR_PAYOUT_RATE, payoutService } from './payouts';

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
    sql`TRUNCATE payout_records, order_events, orders, projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
});

async function estimator(payoutAccountRef: string | null = 'acct_estimator'): Promise<string> {
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
      payout_account_ref: payoutAccountRef,
    })
    .returning();
  return p!.id;
}

async function makeOrder(
  slug: string,
  opts: {
    status?: OrderStatus;
    estimatorId?: string | null;
    price?: number;
    deliveredAt?: Date | null;
  } = {},
): Promise<string> {
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
      status: opts.status ?? 'ACCEPTED',
      price_quote_minor: opts.price ?? 10_000,
      assigned_estimator_id: opts.estimatorId ?? null,
      placed_at: new Date(Date.now() - 200 * HOUR),
      delivered_at: opts.deliveredAt ?? null,
    })
    .returning();
  return order!.id;
}

describe('estimator payouts (P4-04 · GATE)', () => {
  it('computePayoutAmount applies the rate (pure)', () => {
    expect(computePayoutAmount(10_000)).toBe(Math.round(10_000 * ESTIMATOR_PAYOUT_RATE));
    expect(computePayoutAmount(10_000, 0.5)).toBe(5_000);
    expect(computePayoutAmount(999, 0.6)).toBe(599); // rounded
  });

  it('an accepted order pays out the correct amount, PENDING → PAID', async () => {
    const estId = await estimator();
    const orderId = await makeOrder('accepted', {
      status: 'ACCEPTED',
      estimatorId: estId,
      price: 20_000,
    });

    const payout = await payoutService.processAcceptedOrder(admin.db, orderId);

    expect(payout).toMatchObject({
      service_profile_id: estId,
      order_id: orderId,
      amount_minor: 12_000, // 20_000 × 0.6
      status: 'PAID',
    });
    expect(payout!.provider_transfer_ref).toBe(`stub-transfer:${payout!.id}`);
    expect(payout!.settled_at).not.toBeNull();
  });

  it('GATE: a delivered (unaccepted) order does NOT pay out', async () => {
    const estId = await estimator();
    const orderId = await makeOrder('delivered', { status: 'DELIVERED', estimatorId: estId });

    expect(await payoutService.processAcceptedOrder(admin.db, orderId)).toBeNull();
    expect(await payoutService.getByOrder(admin.db, orderId)).toBeUndefined(); // no record at all
  });

  it('GATE: a disputed order never pays out', async () => {
    const estId = await estimator();
    const orderId = await makeOrder('disputed', { status: 'DISPUTED', estimatorId: estId });

    expect(await payoutService.processAcceptedOrder(admin.db, orderId)).toBeNull();
    expect(await payoutService.getByOrder(admin.db, orderId)).toBeUndefined();
  });

  it('an accepted order with no assigned estimator does not pay out', async () => {
    const orderId = await makeOrder('noest', { status: 'ACCEPTED', estimatorId: null });
    expect(await payoutService.processAcceptedOrder(admin.db, orderId)).toBeNull();
    expect(await payoutService.getByOrder(admin.db, orderId)).toBeUndefined();
  });

  it('is exactly-once — a second run does not create or pay a duplicate', async () => {
    const estId = await estimator();
    const orderId = await makeOrder('idem', { status: 'ACCEPTED', estimatorId: estId });

    const first = await payoutService.processAcceptedOrder(admin.db, orderId);
    const second = await payoutService.processAcceptedOrder(admin.db, orderId);

    expect(second!.id).toBe(first!.id); // same record
    expect(await payoutService.listAll(admin.db)).toHaveLength(1);
  });

  it('a failed transfer leaves the payout PENDING (owed, retriable)', async () => {
    const estId = await estimator(null); // no payout account → the stub transfer fails
    const orderId = await makeOrder('fail', { status: 'ACCEPTED', estimatorId: estId });

    const payout = await payoutService.processAcceptedOrder(admin.db, orderId);
    expect(payout).toMatchObject({ status: 'PENDING' });
    expect(payout!.provider_transfer_ref).toBeNull();
  });

  it('a paid payout can be reversed, auditably', async () => {
    const estId = await estimator();
    const orderId = await makeOrder('reverse', {
      status: 'ACCEPTED',
      estimatorId: estId,
      price: 10_000,
    });
    const paid = await payoutService.processAcceptedOrder(admin.db, orderId);

    const reversed = await payoutService.reverse(
      admin.db,
      paid!.id,
      'Dispute resolved for customer',
    );
    expect(reversed).toMatchObject({
      status: 'REVERSED',
      amount_minor: 6_000, // preserved
      provider_transfer_ref: paid!.provider_transfer_ref, // preserved for audit
      reversal_reason: 'Dispute resolved for customer',
    });
    expect(reversed.provider_reversal_ref).toBe(`stub-reversal:${paid!.provider_transfer_ref}`);
    expect(reversed.reversed_at).not.toBeNull();
  });

  it('refuses to reverse a payout that is not PAID', async () => {
    const estId = await estimator(null); // stays PENDING
    const orderId = await makeOrder('badrev', { status: 'ACCEPTED', estimatorId: estId });
    const pending = await payoutService.processAcceptedOrder(admin.db, orderId);

    await expect(payoutService.reverse(admin.db, pending!.id, 'nope')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('auto-accept after the window settles the payout (end-to-end gate)', async () => {
    const estId = await estimator();
    const orderId = await makeOrder('auto', {
      status: 'DELIVERED',
      estimatorId: estId,
      deliveredAt: new Date(Date.now() - 100 * HOUR), // > 72h window
    });

    const acceptedIds = await deliveryService.autoAcceptExpired(admin.db, new Date());
    expect(acceptedIds).toContain(orderId);

    const payout = await payoutService.getByOrder(admin.db, orderId);
    expect(payout).toMatchObject({ status: 'PAID', service_profile_id: estId });
  });
});
