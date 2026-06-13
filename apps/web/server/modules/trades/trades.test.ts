import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MeasurementType, Unit, isUnitValidFor } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { conditionTemplates, tradeCategories } from '../../data/schema';
import { accountsService } from '../accounts';
import { seedGlobalTradeData } from './seed';
import { SEED_CONDITION_COUNT, SEED_TRADES } from './seed-data';
import { tradesRepo } from './repository';

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
    sql`TRUNCATE condition_templates, trade_categories, projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

const newOrg = async (slug: string) =>
  (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;

describe('seed trade structure & starter conditions', () => {
  it('is idempotent — re-running does not duplicate global rows', async () => {
    await seedGlobalTradeData(admin.db); // second run
    const cats = await admin.db.select().from(tradeCategories);
    const conds = await admin.db.select().from(conditionTemplates);
    expect(cats).toHaveLength(SEED_TRADES.length);
    expect(conds).toHaveLength(SEED_CONDITION_COUNT);
  });

  it('a new organization sees the seed trades and conditions', async () => {
    const orgId = await newOrg('acme');

    const cats = await withOrgScope(app.db, orgId, (tx) => tradesRepo.listCategories(tx));
    const conds = await withOrgScope(app.db, orgId, (tx) => tradesRepo.listConditionTemplates(tx));

    expect(cats.map((c) => c.division_code)).toEqual(
      [...SEED_TRADES].sort((a, b) => a.sort_order - b.sort_order).map((t) => t.division_code),
    );
    expect(conds).toHaveLength(SEED_CONDITION_COUNT);
  });

  it('every seeded condition has a valid measurement type and matching unit', async () => {
    const conds = await admin.db.select().from(conditionTemplates);
    expect(conds.length).toBeGreaterThan(0);
    for (const c of conds) {
      expect(MeasurementType.safeParse(c.measurement_type).success, c.name).toBe(true);
      expect(Unit.safeParse(c.unit).success, c.name).toBe(true);
      expect(
        isUnitValidFor(c.measurement_type, c.unit),
        `${c.name}: ${c.unit} vs ${c.measurement_type}`,
      ).toBe(true);
    }
  });

  it("an org's customization is private, but globals stay visible to all", async () => {
    const orgA = await newOrg('org-a');
    const orgB = await newOrg('org-b');

    await withOrgScope(app.db, orgA, (tx) =>
      tradesRepo.insertCategory(tx, {
        org_id: orgA,
        name: 'Custom Trade',
        division_code: '99',
        sort_order: 999,
      }),
    );

    const aCats = await withOrgScope(app.db, orgA, (tx) => tradesRepo.listCategories(tx));
    const bCats = await withOrgScope(app.db, orgB, (tx) => tradesRepo.listCategories(tx));

    expect(aCats).toHaveLength(SEED_TRADES.length + 1); // globals + own custom
    expect(bCats).toHaveLength(SEED_TRADES.length); // globals only — A's custom is hidden
    expect(bCats.some((c) => c.division_code === '99')).toBe(false);
  });
});
