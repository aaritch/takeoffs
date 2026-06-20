import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { sheets } from '../../data/schema';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo } from '../source-files/repository';
import { calibrateScale } from './scale';
import { sheetsRepo } from './repository';

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
    sql`TRUNCATE sheets, source_files, plan_sets, projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

async function seedSheet() {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: 'acme',
      slug: 'acme',
      owner: { email: 'acme@t.test' },
    })
  ).organization.id;
  const sheetId = await withOrgScope(app.db, orgId, async (tx) => {
    const p = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    const ps = await planSetsRepo.insert(tx, {
      org_id: orgId,
      project_id: p.id,
      version_number: 1,
    });
    const sfId = uuidv7();
    await tx.execute(
      sql`insert into source_files (id, org_id, plan_set_id, original_filename, mime_type, byte_size, checksum_sha256, storage_key, upload_status) values (${sfId}, ${orgId}, ${ps.id}, 'a.pdf', 'application/pdf', 1, ${'a'.repeat(64)}, 'k', 'UPLOADED')`,
    );
    const [s] = await tx
      .insert(sheets)
      .values({ org_id: orgId, plan_set_id: ps.id, source_file_id: sfId, index_in_set: 0 })
      .returning();
    return s!.id;
  });
  return { orgId, sheetId };
}

describe('calibrateScale (P1-09)', () => {
  it('confirms the scale from a two-point reference (feet per normalized pixel)', async () => {
    const { orgId, sheetId } = await seedSheet();
    // A 100px segment is 25 feet → 0.25 ft/px.
    const view = await withOrgScope(app.db, orgId, (tx) =>
      calibrateScale(tx, sheetId, {
        p1: { x: 0, y: 0 },
        p2: { x: 100, y: 0 },
        realLength: 25,
        lengthUnit: 'FEET',
        units: 'IMPERIAL',
      }),
    );
    expect(view.scaleStatus).toBe('CONFIRMED');
    expect(view.unitPerPixel).toBeCloseTo(0.25);
    expect(view.scaleUnits).toBe('IMPERIAL');

    const row = await withOrgScope(app.db, orgId, (tx) => sheetsRepo.getById(tx, sheetId));
    expect(row?.scale_status).toBe('CONFIRMED');
  });

  it('converts non-foot input units to canonical feet', async () => {
    const { orgId, sheetId } = await seedSheet();
    // 100px = 100 inches → 100/12 ft over 100px → ~0.0833 ft/px.
    const view = await withOrgScope(app.db, orgId, (tx) =>
      calibrateScale(tx, sheetId, {
        p1: { x: 0, y: 0 },
        p2: { x: 100, y: 0 },
        realLength: 100,
        lengthUnit: 'INCHES',
        units: 'IMPERIAL',
      }),
    );
    expect(view.unitPerPixel).toBeCloseTo(1 / 12);
  });

  it('rejects a degenerate (zero-length) reference segment', async () => {
    const { orgId, sheetId } = await seedSheet();
    await expect(
      withOrgScope(app.db, orgId, (tx) =>
        calibrateScale(tx, sheetId, {
          p1: { x: 50, y: 50 },
          p2: { x: 50, y: 50 },
          realLength: 10,
          lengthUnit: 'FEET',
          units: 'IMPERIAL',
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
