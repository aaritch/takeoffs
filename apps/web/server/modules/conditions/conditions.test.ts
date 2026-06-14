import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { tradeCategories } from '../../data/schema';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { takeoffsRepo } from '../takeoffs/repository';
import { seedGlobalTradeData } from '../trades/seed';
import { conditionsService } from './service';
import { conditionsRepo } from './repository';

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

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE conditions, takeoffs, projects, condition_templates, trade_categories, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

/** Create an org + project + takeoff, and grab a global trade category id. */
async function setup(slug = 'acme') {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;

  return withOrgScope(app.db, orgId, async (tx) => {
    const project = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid 1' });
    const takeoff = await takeoffsRepo.insert(tx, { org_id: orgId, project_id: project.id });
    const cat = await tx.query.tradeCategories.findFirst({
      where: eq(tradeCategories.division_code, '03'),
    });
    return { orgId, takeoffId: takeoff.id, tradeCategoryId: cat!.id };
  });
}

describe('condition CRUD & validation', () => {
  it('creates conditions of each measurement type with valid units', async () => {
    const { orgId, takeoffId, tradeCategoryId } = await setup();
    const base = { takeoff_id: takeoffId, trade_category_id: tradeCategoryId };

    await withOrgScope(app.db, orgId, async (tx) => {
      await conditionsService.create(tx, {
        ...base,
        name: 'Slab',
        measurement_type: 'AREA',
        unit: 'SF',
      });
      await conditionsService.create(tx, {
        ...base,
        name: 'Footing',
        measurement_type: 'LINEAR',
        unit: 'LF',
      });
      await conditionsService.create(tx, {
        ...base,
        name: 'Doors',
        measurement_type: 'COUNT',
        unit: 'EA',
      });
      await conditionsService.create(tx, {
        ...base,
        name: 'Excavation',
        measurement_type: 'VOLUME',
        unit: 'CY',
      });
    });

    const list = await withOrgScope(app.db, orgId, (tx) => conditionsService.list(tx, takeoffId));
    expect(list).toHaveLength(4);
  });

  it('rejects an invalid measurement-type/unit combination', async () => {
    const { orgId, takeoffId, tradeCategoryId } = await setup();
    await expect(
      withOrgScope(app.db, orgId, (tx) =>
        conditionsService.create(tx, {
          takeoff_id: takeoffId,
          trade_category_id: tradeCategoryId,
          name: 'Bad',
          measurement_type: 'LINEAR',
          unit: 'SF', // SF is area, not length
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', field: 'unit' });
  });

  it('allows depth on an AREA condition but rejects it on a COUNT condition', async () => {
    const { orgId, takeoffId, tradeCategoryId } = await setup();
    const base = { takeoff_id: takeoffId, trade_category_id: tradeCategoryId };

    const created = await withOrgScope(app.db, orgId, (tx) =>
      conditionsService.create(tx, {
        ...base,
        name: 'Slab',
        measurement_type: 'AREA',
        unit: 'SF',
        depth_or_height: 0.5,
      }),
    );
    expect(created.depth_or_height).toBe(0.5);

    await expect(
      withOrgScope(app.db, orgId, (tx) =>
        conditionsService.create(tx, {
          ...base,
          name: 'Doors',
          measurement_type: 'COUNT',
          unit: 'EA',
          depth_or_height: 3,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', field: 'depth_or_height' });
  });

  it('validates the merged shape on update and rejects an invalid unit', async () => {
    const { orgId, takeoffId, tradeCategoryId } = await setup();
    const created = await withOrgScope(app.db, orgId, (tx) =>
      conditionsService.create(tx, {
        takeoff_id: takeoffId,
        trade_category_id: tradeCategoryId,
        name: 'Slab',
        measurement_type: 'AREA',
        unit: 'SF',
      }),
    );

    await expect(
      withOrgScope(app.db, orgId, (tx) => conditionsService.update(tx, created.id, { unit: 'LF' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const renamed = await withOrgScope(app.db, orgId, (tx) =>
      conditionsService.update(tx, created.id, { name: 'Slab on Grade', waste_factor_pct: 5 }),
    );
    expect(renamed.name).toBe('Slab on Grade');
    expect(renamed.waste_factor_pct).toBe(5);
  });

  it('soft-deletes a condition', async () => {
    const { orgId, takeoffId, tradeCategoryId } = await setup();
    const created = await withOrgScope(app.db, orgId, (tx) =>
      conditionsService.create(tx, {
        takeoff_id: takeoffId,
        trade_category_id: tradeCategoryId,
        name: 'Slab',
        measurement_type: 'AREA',
        unit: 'SF',
      }),
    );
    await withOrgScope(app.db, orgId, (tx) => conditionsService.remove(tx, created.id));
    const list = await withOrgScope(app.db, orgId, (tx) => conditionsService.list(tx, takeoffId));
    expect(list).toHaveLength(0);
  });

  it("does not leak one org's conditions to another", async () => {
    const a = await setup('org-a');
    const b = await setup('org-b');
    const created = await withOrgScope(app.db, a.orgId, (tx) =>
      conditionsService.create(tx, {
        takeoff_id: a.takeoffId,
        trade_category_id: a.tradeCategoryId,
        name: 'Slab',
        measurement_type: 'AREA',
        unit: 'SF',
      }),
    );

    const seenByB = await withOrgScope(app.db, b.orgId, (tx) =>
      conditionsRepo.getById(tx, created.id),
    );
    expect(seenByB).toBeUndefined();
  });
});
