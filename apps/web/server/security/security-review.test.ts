import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ServiceProfile } from '../modules/accounts/repository';
import { createDb, type DbHandle } from '../data/client';
import { withOrgScope } from '../data/org-scope';
import { projects } from '../data/schema';
import { accountsService } from '../modules/accounts';
import { projectsRepo } from '../modules/projects/repository';
import { webhookEndpointsRepo, webhookService } from '../modules/webhooks';
import { resolvePlatformActor } from '../platform/platform-actor';
import { assertKeyInOrg, orgStorageKey } from '../storage/keys';

/**
 * Security review & pen-test regression suite (P5-06). The adversarial counterpart to the threat
 * model in docs/security/ — every attack here MUST fail. It guards the four focus areas a pen test
 * targets: tenant isolation, auth-bypass, injection, and file handling. (Payments gate properties are
 * proven adversarially in payouts.test / placement.test; tenant RLS coverage in org-isolation.test.)
 */

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE webhook_deliveries, webhook_endpoints, projects, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

const makeOrg = (slug: string) =>
  accountsService
    .createOrganizationWithOwner(admin.db, { name: slug, slug, owner: { email: `${slug}@t.test` } })
    .then((r) => r.organization.id);

describe('tenant isolation — cross-org access fails (P5-06)', () => {
  it("an org cannot see or touch another org's data, and a no-scope query returns nothing", async () => {
    const orgA = await makeOrg('orga');
    const orgB = await makeOrg('orgb');

    const { endpoint } = await withOrgScope(app.db, orgA, (tx) =>
      webhookService.createEndpoint(tx, {
        orgId: orgA,
        url: 'https://a.example/hook',
        eventTypes: ['ORDER_DELIVERED'],
      }),
    );

    // Org B, fully scoped, cannot read org A's endpoint nor list it.
    const seenByB = await withOrgScope(app.db, orgB, (tx) =>
      webhookEndpointsRepo.getById(tx, endpoint.id),
    );
    expect(seenByB).toBeUndefined();
    const bList = await withOrgScope(app.db, orgB, (tx) =>
      webhookEndpointsRepo.listByOrg(tx, orgB),
    );
    expect(bList).toHaveLength(0);

    // A query with NO org scope (RLS app role, no app.current_org_id) is fail-closed → nothing.
    const unscoped = await app.db.query.webhookEndpoints.findMany();
    expect(unscoped).toHaveLength(0);
  });
});

describe('auth-bypass attempts fail (P5-06)', () => {
  it('platform-staff access is denied without an active profile of the right role', () => {
    const valid = {
      id: 'p1',
      user_id: 'u1',
      role: 'SERVICE_ESTIMATOR',
      active: true,
    } as ServiceProfile;
    const inactive = { ...valid, active: false } as ServiceProfile;

    expect(() => resolvePlatformActor(undefined)).toThrow(/Platform staff access required/);
    expect(() => resolvePlatformActor(inactive)).toThrow(/Platform staff access required/);
    expect(() => resolvePlatformActor(valid, ['PLATFORM_ADMIN'])).toThrow(
      /Insufficient platform role/,
    );
    expect(resolvePlatformActor(valid, ['SERVICE_ESTIMATOR']).serviceProfileId).toBe('p1');
  });

  it('a low-privilege member cannot perform a privileged action (manage members)', async () => {
    const { organization, owner } = await accountsService.createOrganizationWithOwner(admin.db, {
      name: 'authz',
      slug: 'authz',
      owner: { email: 'owner@authz.test' },
    });
    const viewer = await accountsService.inviteMember(admin.db, {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'viewer@authz.test',
      role: 'VIEWER',
    });
    await accountsService.acceptInvitation(admin.db, {
      orgId: organization.id,
      userId: viewer.user_id,
    });

    // The VIEWER tries to invite someone — must be forbidden (no members:manage capability).
    await expect(
      accountsService.inviteMember(admin.db, {
        orgId: organization.id,
        actorUserId: viewer.user_id,
        email: 'mole@authz.test',
        role: 'ADMIN',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('injection attempts are neutralized (P5-06)', () => {
  it('a SQL-injection payload in a field is stored as data, not executed', async () => {
    const orgId = await makeOrg('inject');
    const payload = "Robert'); DROP TABLE projects; --";

    const created = await withOrgScope(app.db, orgId, (tx) =>
      projectsRepo.insert(tx, { org_id: orgId, name: payload }),
    );

    // Stored verbatim (parameterized query — no execution).
    const readBack = await withOrgScope(app.db, orgId, (tx) =>
      projectsRepo.getById(tx, created.id),
    );
    expect(readBack?.name).toBe(payload);

    // The table was NOT dropped — it's still queryable.
    const rows = await admin.db.select().from(projects).where(eq(projects.id, created.id));
    expect(rows).toHaveLength(1);
  });
});

describe('file handling — keys cannot cross the org boundary (P5-06)', () => {
  it('a storage key is guarded to its owning org and rejects path traversal', () => {
    const orgA = '019f0000-0000-7000-8000-00000000000a';
    const orgB = '019f0000-0000-7000-8000-00000000000b';
    const key = orgStorageKey(orgA, 'plan-sets', 'ps1', 'file.pdf');

    expect(() => assertKeyInOrg(key, orgA)).not.toThrow();
    expect(() => assertKeyInOrg(key, orgB)).toThrow(/does not belong to this organization/);
    expect(() => orgStorageKey(orgA, '..', 'etc', 'passwd')).toThrow(/\.\.|leading slashes/);
  });
});
