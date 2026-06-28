import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BillingSubscriptionEvent } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { billingEvents, organizations, subscriptions } from '../../data/schema';
import { accountsService } from '../accounts';
import { billingWebhookService } from './webhook';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE billing_events, subscriptions, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
});

/** Hourly UTC timestamps so events have a deterministic order. */
const T = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour)).toISOString();

async function org(slug: string) {
  const { organization, owner } = await accountsService.createOrganizationWithOwner(admin.db, {
    name: slug,
    slug,
    owner: { email: `${slug}@t.test` },
  });
  return { orgId: organization.id, ownerId: owner.id };
}

function event(o: Partial<BillingSubscriptionEvent> & { orgId: string }): BillingSubscriptionEvent {
  return {
    providerEventId: o.providerEventId ?? `evt_${o.orgId}_${o.occurredAt ?? T(1)}`,
    type: o.type ?? 'SUBSCRIPTION_UPDATED',
    occurredAt: o.occurredAt ?? T(1),
    orgId: o.orgId,
    customerRef: o.customerRef ?? `cus_${o.orgId}`,
    subscriptionRef: o.subscriptionRef ?? `sub_${o.orgId}`,
    status: o.status ?? 'ACTIVE',
    planTier: o.planTier ?? 'STARTER',
    ...(o.currentPeriodEnd !== undefined ? { currentPeriodEnd: o.currentPeriodEnd } : {}),
    ...(o.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: o.cancelAtPeriodEnd } : {}),
  };
}

const getOrg = (id: string) =>
  admin.db.query.organizations.findFirst({ where: eq(organizations.id, id) });
const getSub = (orgId: string) =>
  admin.db.query.subscriptions.findFirst({ where: eq(subscriptions.org_id, orgId) });
const handle = (e: BillingSubscriptionEvent) => billingWebhookService.handleEvent(admin.db, e);

describe('billing webhook reconciliation (P4-01)', () => {
  it('create → upgrade → downgrade → cancel updates entitlements each time', async () => {
    const { orgId } = await org('life');

    await handle(event({ orgId, providerEventId: 'e1', occurredAt: T(1), planTier: 'STARTER' }));
    expect(await getOrg(orgId)).toMatchObject({
      plan_tier: 'STARTER',
      seat_limit: 5,
      status: 'ACTIVE',
    });

    await handle(event({ orgId, providerEventId: 'e2', occurredAt: T(2), planTier: 'PRO' }));
    expect(await getOrg(orgId)).toMatchObject({ plan_tier: 'PRO', seat_limit: 20 });

    await handle(event({ orgId, providerEventId: 'e3', occurredAt: T(3), planTier: 'STARTER' }));
    expect(await getOrg(orgId)).toMatchObject({ plan_tier: 'STARTER', seat_limit: 5 });

    await handle(
      event({
        orgId,
        providerEventId: 'e4',
        occurredAt: T(4),
        status: 'CANCELED',
        planTier: 'STARTER',
      }),
    );
    expect(await getOrg(orgId)).toMatchObject({
      plan_tier: 'FREE',
      seat_limit: 3,
      status: 'ACTIVE',
    });

    // One subscription row reconciled throughout, now reflecting the final provider state.
    expect(await getSub(orgId)).toMatchObject({ status: 'CANCELED', cancel_at_period_end: false });
  });

  it('a past-due subscription puts the org in the PAST_DUE restricted state, keeping its tier', async () => {
    const { orgId } = await org('pastdue');
    await handle(
      event({ orgId, providerEventId: 'a1', occurredAt: T(1), status: 'ACTIVE', planTier: 'PRO' }),
    );
    await handle(
      event({
        orgId,
        providerEventId: 'a2',
        occurredAt: T(2),
        status: 'PAST_DUE',
        planTier: 'PRO',
      }),
    );
    expect(await getOrg(orgId)).toMatchObject({
      status: 'PAST_DUE',
      plan_tier: 'PRO',
      seat_limit: 20,
    });
    expect(await getSub(orgId)).toMatchObject({ status: 'PAST_DUE' });
  });

  it('a redelivered event is applied exactly once (idempotent)', async () => {
    const { orgId } = await org('dup');
    const e = event({ orgId, providerEventId: 'dup1', occurredAt: T(1), planTier: 'PRO' });

    expect(await handle(e)).toMatchObject({ applied: true });
    expect(await handle(e)).toEqual({ applied: false, reason: 'duplicate' });

    const evs = await admin.db.query.billingEvents.findMany({
      where: eq(billingEvents.provider_event_id, 'dup1'),
    });
    expect(evs).toHaveLength(1);
    expect(await getOrg(orgId)).toMatchObject({ plan_tier: 'PRO' });
  });

  it('an out-of-order (older) event is recorded but does not roll state back', async () => {
    const { orgId } = await org('order');
    // Newer event arrives first.
    await handle(
      event({ orgId, providerEventId: 'o2', occurredAt: T(2), status: 'ACTIVE', planTier: 'PRO' }),
    );
    // Then an OLDER delivery (distinct id, so it passes the idempotency gate).
    const stale = await handle(
      event({
        orgId,
        providerEventId: 'o1',
        occurredAt: T(1),
        status: 'ACTIVE',
        planTier: 'STARTER',
      }),
    );
    expect(stale).toEqual({ applied: false, reason: 'stale' });
    expect(await getOrg(orgId)).toMatchObject({ plan_tier: 'PRO', seat_limit: 20 }); // unchanged
  });

  it('the webhook-set seat limit enforces against membership (Phase 0)', async () => {
    const { orgId, ownerId } = await org('seats');
    // Upgrade to STARTER → seat limit 5 (owner already fills 1).
    await handle(
      event({
        orgId,
        providerEventId: 's1',
        occurredAt: T(1),
        status: 'ACTIVE',
        planTier: 'STARTER',
      }),
    );
    expect(await getOrg(orgId)).toMatchObject({ seat_limit: 5 });

    // Fill the remaining 4 seats.
    for (let i = 0; i < 4; i++) {
      const m = await accountsService.inviteMember(admin.db, {
        orgId,
        actorUserId: ownerId,
        email: `seat${i}@t.test`,
        role: 'VIEWER',
      });
      await accountsService.acceptInvitation(admin.db, { orgId, userId: m.user_id });
    }

    // The 6th member exceeds the webhook-set limit and is blocked at acceptance.
    const overflow = await accountsService.inviteMember(admin.db, {
      orgId,
      actorUserId: ownerId,
      email: 'overflow@t.test',
      role: 'VIEWER',
    });
    await expect(
      accountsService.acceptInvitation(admin.db, { orgId, userId: overflow.user_id }),
    ).rejects.toMatchObject({ code: 'SEAT_LIMIT_EXCEEDED' });
  });
});
