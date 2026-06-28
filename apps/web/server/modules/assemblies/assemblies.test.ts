import { fileURLToPath } from 'node:url';
import { isNull, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MeasurementGeometry, MeasurementType, Unit } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { conditions, takeoffs, tradeCategories } from '../../data/schema';
import { projects } from '../../data/schema';
import { accountsService } from '../accounts';
import { getRollup, measurementsService } from '../measurements';
import { seedGlobalTradeData } from '../trades/seed';
import { assemblyService } from './service';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let orgId: string;
let takeoffId: string;
let tradeId: string;

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE quantity_rollups, measurements, assembly_instances, assembly_components, assemblies, conditions, takeoffs, sheets, source_files, plan_sets, projects, condition_templates, trade_categories, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
  tradeId = (await admin.db.query.tradeCategories.findFirst({
    where: isNull(tradeCategories.org_id),
  }))!.id;
  orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: 'asm',
      slug: 'asm',
      owner: { email: 'asm@t.test' },
    })
  ).organization.id;
  const [project] = await admin.db
    .insert(projects)
    .values({ org_id: orgId, name: 'Bid' })
    .returning();
  const [takeoff] = await admin.db
    .insert(takeoffs)
    .values({ org_id: orgId, project_id: project!.id, origin: 'SELF_SERVE' })
    .returning();
  takeoffId = takeoff!.id;
});

afterAll(async () => {
  await admin.pool.end();
});

async function condition(name: string, type: MeasurementType, unit: Unit): Promise<string> {
  const [c] = await admin.db
    .insert(conditions)
    .values({
      org_id: orgId,
      takeoff_id: takeoffId,
      trade_category_id: tradeId,
      name,
      measurement_type: type,
      unit,
    })
    .returning();
  return c!.id;
}

const polyline = (length: number): MeasurementGeometry => ({
  type: 'POLYLINE',
  points: [
    { x: 0, y: 0 },
    { x: length, y: 0 },
  ],
});

const base = (conditionId: string) =>
  admin.db.transaction((tx) => getRollup(tx, conditionId)).then((r) => r?.base_quantity ?? 0);

/** A wall assembly: one drawn line drives studs (×1.5), drywall (×8 = height), track (×2). */
async function wallAssembly() {
  const studs = await condition('Studs', 'COUNT', 'EA');
  const drywall = await condition('Drywall', 'AREA', 'SF');
  const track = await condition('Track', 'LINEAR', 'LF');
  const { assembly } = await admin.db.transaction((tx) =>
    assemblyService.create(tx, {
      takeoffId,
      name: 'Wall',
      driverMeasurementType: 'LINEAR',
      components: [
        { conditionId: studs, factor: 1.5 },
        { conditionId: drywall, factor: 8 },
        { conditionId: track, factor: 2 },
      ],
    }),
  );
  return { assemblyId: assembly.id, studs, drywall, track };
}

describe('assemblies (P4-07)', () => {
  it('drawing against an assembly updates every child condition by its factor', async () => {
    const { assemblyId, studs, drywall, track } = await wallAssembly();

    await admin.db.transaction((tx) =>
      assemblyService.draw(tx, { assemblyId, geometry: polyline(10), unitPerPixel: 1 }),
    );

    expect(await base(studs)).toBe(15); // 10 × 1.5
    expect(await base(drywall)).toBe(80); // 10 × 8
    expect(await base(track)).toBe(20); // 10 × 2
  });

  it('editing the geometry recomputes all linked quantities consistently', async () => {
    const { assemblyId, studs, drywall, track } = await wallAssembly();
    const instance = await admin.db.transaction((tx) =>
      assemblyService.draw(tx, { assemblyId, geometry: polyline(10), unitPerPixel: 1 }),
    );

    await admin.db.transaction((tx) =>
      assemblyService.updateInstanceGeometry(tx, instance.id, polyline(20), 1),
    );

    expect(await base(studs)).toBe(30); // 20 × 1.5
    expect(await base(drywall)).toBe(160); // 20 × 8
    expect(await base(track)).toBe(40); // 20 × 2
  });

  it('removing the instance clears every child contribution', async () => {
    const { assemblyId, studs, drywall, track } = await wallAssembly();
    const instance = await admin.db.transaction((tx) =>
      assemblyService.draw(tx, { assemblyId, geometry: polyline(10), unitPerPixel: 1 }),
    );

    await admin.db.transaction((tx) => assemblyService.removeInstance(tx, instance.id));

    expect(await base(studs)).toBe(0);
    expect(await base(drywall)).toBe(0);
    expect(await base(track)).toBe(0);
  });

  it('a condition combines its own measurements with assembly contributions', async () => {
    const { assemblyId, studs } = await wallAssembly();
    await admin.db.transaction((tx) =>
      assemblyService.draw(tx, { assemblyId, geometry: polyline(10), unitPerPixel: 1 }),
    ); // studs += 15

    // A direct count of 5 on the same condition adds to the assembly contribution.
    await admin.db.transaction((tx) =>
      measurementsService.create(tx, {
        condition_id: studs,
        geometry: { type: 'POINT_GROUP', points: [0, 1, 2, 3, 4].map((i) => ({ x: i, y: 0 })) },
        unit_per_pixel: 1,
      }),
    );

    expect(await base(studs)).toBe(20); // 15 (assembly) + 5 (direct)
  });

  it('exposes the components + factors (explicit, auditable)', async () => {
    const { studs } = await wallAssembly();
    const list = await admin.db.transaction((tx) => assemblyService.listByTakeoff(tx, takeoffId));
    expect(list).toHaveLength(1);
    const studComponent = list[0]!.components.find((c) => c.conditionId === studs);
    expect(studComponent?.factor).toBe(1.5);
  });

  it('rejects a non-positive factor and a condition from another takeoff', async () => {
    const studs = await condition('Studs', 'COUNT', 'EA');
    await expect(
      admin.db.transaction((tx) =>
        assemblyService.create(tx, {
          takeoffId,
          name: 'Bad',
          driverMeasurementType: 'LINEAR',
          components: [{ conditionId: studs, factor: 0 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    // A condition in a different takeoff cannot be a component.
    const [other] = await admin.db
      .insert(takeoffs)
      .values({
        org_id: orgId,
        project_id: (await admin.db.query.projects.findFirst())!.id,
        origin: 'SELF_SERVE',
      })
      .returning();
    const [foreign] = await admin.db
      .insert(conditions)
      .values({
        org_id: orgId,
        takeoff_id: other!.id,
        trade_category_id: tradeId,
        name: 'Foreign',
        measurement_type: 'LINEAR',
        unit: 'LF',
      })
      .returning();
    await expect(
      admin.db.transaction((tx) =>
        assemblyService.create(tx, {
          takeoffId,
          name: 'Bad2',
          driverMeasurementType: 'LINEAR',
          components: [{ conditionId: foreign!.id, factor: 1 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
