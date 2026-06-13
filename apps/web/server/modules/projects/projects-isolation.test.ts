import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { projects } from '../../data/schema';
import { accountsService } from '../accounts';
import { projectsRepo } from './repository';

// Org-isolation GATE proof. Setup uses the ADMIN connection (superuser, bypasses RLS) to create
// two orgs. All tenant access uses the APP connection (non-superuser `takeoff_app`, subject to
// RLS) via withOrgScope, so these assertions exercise the real database-enforced isolation.
const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

afterEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

async function twoOrgs() {
  const a = await accountsService.createOrganizationWithOwner(admin.db, {
    name: 'Org A',
    slug: 'org-a',
    owner: { email: 'a@a.test' },
  });
  const b = await accountsService.createOrganizationWithOwner(admin.db, {
    name: 'Org B',
    slug: 'org-b',
    owner: { email: 'b@b.test' },
  });
  return { orgA: a.organization.id, orgB: b.organization.id };
}

describe('project org isolation (RLS, fail-closed)', () => {
  it('a scoped insert is visible only within its own org', async () => {
    const { orgA, orgB } = await twoOrgs();
    const created = await withOrgScope(app.db, orgA, (tx) =>
      projectsRepo.insert(tx, { org_id: orgA, name: 'A-Project' }),
    );

    const seenByA = await withOrgScope(app.db, orgA, (tx) => projectsRepo.getById(tx, created.id));
    expect(seenByA?.name).toBe('A-Project');

    const seenByB = await withOrgScope(app.db, orgB, (tx) => projectsRepo.getById(tx, created.id));
    expect(seenByB).toBeUndefined();

    const listB = await withOrgScope(app.db, orgB, (tx) => projectsRepo.listLive(tx));
    expect(listB).toHaveLength(0);
  });

  it('another org cannot update or delete a project it cannot see (0 rows affected)', async () => {
    const { orgA, orgB } = await twoOrgs();
    const created = await withOrgScope(app.db, orgA, (tx) =>
      projectsRepo.insert(tx, { org_id: orgA, name: 'A-Project' }),
    );

    const renamed = await withOrgScope(app.db, orgB, (tx) =>
      projectsRepo.rename(tx, created.id, 'Hijacked'),
    );
    expect(renamed).toBe(0);

    const removed = await withOrgScope(app.db, orgB, (tx) => projectsRepo.remove(tx, created.id));
    expect(removed).toBe(0);

    // Untouched for the real owner.
    const still = await withOrgScope(app.db, orgA, (tx) => projectsRepo.getById(tx, created.id));
    expect(still?.name).toBe('A-Project');
  });

  it('cannot insert a row into another org (WITH CHECK rejects)', async () => {
    const { orgA, orgB } = await twoOrgs();
    await expect(
      withOrgScope(app.db, orgB, (tx) => projectsRepo.insert(tx, { org_id: orgA, name: 'X' })),
    ).rejects.toThrow();
  });

  it('a query with NO org scope returns nothing (fail closed)', async () => {
    const { orgA } = await twoOrgs();
    await withOrgScope(app.db, orgA, (tx) => projectsRepo.insert(tx, { org_id: orgA, name: 'A' }));

    // Querying the app connection without withOrgScope => app.current_org_id is unset => RLS hides all rows.
    const rows = await app.db.select().from(projects);
    expect(rows).toHaveLength(0);
  });
});
