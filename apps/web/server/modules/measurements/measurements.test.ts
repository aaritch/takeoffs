import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MeasurementGeometry } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { tradeCategories } from '../../data/schema';
import { accountsService } from '../accounts';
import { conditionsService, type CreateConditionInput } from '../conditions';
import { projectsRepo } from '../projects/repository';
import { takeoffsRepo } from '../takeoffs/repository';
import { seedGlobalTradeData } from '../trades/seed';
import { measurementsService } from './service';

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
    sql`TRUNCATE measurements, quantity_rollups, conditions, takeoffs, projects, condition_templates, trade_categories, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

const UPP = 0.5; // ft per normalized pixel
const square = (s: number): MeasurementGeometry => ({
  type: 'POLYGON',
  exterior: [
    { x: 0, y: 0 },
    { x: 0, y: s },
    { x: s, y: s },
    { x: s, y: 0 },
  ],
});

/** Org + project + takeoff + a condition of the given shape. Returns ids. */
async function setupCondition(
  cond: Omit<CreateConditionInput, 'takeoff_id' | 'trade_category_id'>,
  slug = 'acme',
) {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;

  return withOrgScope(app.db, orgId, async (tx) => {
    const project = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    const takeoff = await takeoffsRepo.insert(tx, { org_id: orgId, project_id: project.id });
    const cat = await tx.query.tradeCategories.findFirst({
      where: eq(tradeCategories.division_code, '03'),
    });
    const condition = await conditionsService.create(tx, {
      ...cond,
      takeoff_id: takeoff.id,
      trade_category_id: cat!.id,
    });
    return { orgId, conditionId: condition.id };
  });
}

describe('quantity rollups (server-authoritative)', () => {
  it('updates the rollup as measurements are added, edited, and deleted', async () => {
    const { orgId, conditionId } = await setupCondition({
      name: 'Slab',
      measurement_type: 'AREA',
      unit: 'SF',
    });

    const r1 = await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.create(tx, {
        condition_id: conditionId,
        geometry: square(100),
        unit_per_pixel: UPP,
      }),
    );
    expect(r1.measurement.raw_value).toBe(2500);
    expect(r1.rollup.base_quantity).toBe(2500);
    expect(r1.rollup.measurement_count).toBe(1);

    const r2 = await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.create(tx, {
        condition_id: conditionId,
        geometry: square(100),
        unit_per_pixel: UPP,
      }),
    );
    expect(r2.rollup.base_quantity).toBe(5000);
    expect(r2.rollup.measurement_count).toBe(2);

    const edited = await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.updateGeometry(tx, r1.measurement.id, square(50), UPP),
    ); // 2500 px² → 625 sq ft
    expect(edited.rollup.base_quantity).toBe(625 + 2500);

    const afterDelete = await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.remove(tx, r2.measurement.id),
    );
    expect(afterDelete.base_quantity).toBe(625);
    expect(afterDelete.measurement_count).toBe(1);
  });

  it('derives the total from geometry alone — no client total is accepted', async () => {
    // CreateMeasurementInput exposes only geometry + scale; there is no field through which a
    // client could assert a quantity. The stored rollup equals the server-computed value.
    const { orgId, conditionId } = await setupCondition({
      name: 'Slab',
      measurement_type: 'AREA',
      unit: 'SF',
    });
    const r = await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.create(tx, {
        condition_id: conditionId,
        geometry: square(100),
        unit_per_pixel: UPP,
      }),
    );
    expect(r.rollup.base_quantity).toBe(2500);
  });

  it('rolls up waste, derived volume, and extended cost', async () => {
    const { orgId, conditionId } = await setupCondition({
      name: 'Slab',
      measurement_type: 'AREA',
      unit: 'SF',
      depth_or_height: 0.5,
      waste_factor_pct: 5,
      unit_cost_minor: 350,
    });
    const r = await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.create(tx, {
        condition_id: conditionId,
        geometry: square(100),
        unit_per_pixel: UPP,
      }),
    );
    expect(r.rollup.base_quantity).toBe(2500);
    expect(r.rollup.quantity_with_waste).toBeCloseTo(2625, 6); // +5%
    expect(r.rollup.derived_volume).toBe(1250); // 2500 × 0.5
    expect(r.rollup.extended_cost_minor).toBe(Math.round(350 * 2625)); // cost × display qty (SF)
  });

  it('supports LINEAR (polyline) and COUNT (point group) conditions', async () => {
    const linear = await setupCondition(
      { name: 'Footing', measurement_type: 'LINEAR', unit: 'LF' },
      'lin',
    );
    const rl = await withOrgScope(app.db, linear.orgId, (tx) =>
      measurementsService.create(tx, {
        condition_id: linear.conditionId,
        geometry: {
          type: 'POLYLINE',
          points: [
            { x: 0, y: 0 },
            { x: 0, y: 200 },
          ],
        },
        unit_per_pixel: UPP,
      }),
    );
    expect(rl.rollup.base_quantity).toBe(100);

    const counted = await setupCondition(
      { name: 'Doors', measurement_type: 'COUNT', unit: 'EA' },
      'cnt',
    );
    const rc = await withOrgScope(app.db, counted.orgId, (tx) =>
      measurementsService.create(tx, {
        condition_id: counted.conditionId,
        geometry: {
          type: 'POINT_GROUP',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
        unit_per_pixel: 1,
      }),
    );
    expect(rc.rollup.base_quantity).toBe(3);
  });

  it('rejects geometry that does not match the condition, and unsupported VOLUME conditions', async () => {
    const linear = await setupCondition(
      { name: 'Footing', measurement_type: 'LINEAR', unit: 'LF' },
      'lin2',
    );
    await expect(
      withOrgScope(app.db, linear.orgId, (tx) =>
        measurementsService.create(tx, {
          condition_id: linear.conditionId,
          geometry: square(10),
          unit_per_pixel: UPP,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', field: 'geometry' });

    const vol = await setupCondition(
      { name: 'Excavation', measurement_type: 'VOLUME', unit: 'CY' },
      'vol',
    );
    await expect(
      withOrgScope(app.db, vol.orgId, (tx) =>
        measurementsService.create(tx, {
          condition_id: vol.conditionId,
          geometry: square(10),
          unit_per_pixel: UPP,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('converges when two separate transactions add measurements (independent edits)', async () => {
    const { orgId, conditionId } = await setupCondition({
      name: 'Slab',
      measurement_type: 'AREA',
      unit: 'SF',
    });

    // Two independent "users", each in its own scoped transaction.
    await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.create(tx, {
        condition_id: conditionId,
        geometry: square(100),
        unit_per_pixel: UPP,
      }),
    );
    await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.create(tx, {
        condition_id: conditionId,
        geometry: square(100),
        unit_per_pixel: UPP,
      }),
    );

    const rollup = await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.rollupFor(tx, conditionId),
    );
    expect(rollup?.base_quantity).toBe(5000);
    expect(rollup?.measurement_count).toBe(2);
  });
});
