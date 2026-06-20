import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { sheets } from '../../data/schema';
import { S3Storage } from '../../storage';
import { orgStorageKey } from '../../storage/keys';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo } from '../source-files/repository';
import { getTileObject } from './tiles';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

const storage = new S3Storage({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'takeoff-dev',
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'takeoff',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'takeoffdev',
  forcePathStyle: true,
});

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

async function makeSheetWithTiles(slug: string) {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;
  const { planSetId, sheetId } = await withOrgScope(app.db, orgId, async (tx) => {
    const p = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    const ps = await planSetsRepo.insert(tx, {
      org_id: orgId,
      project_id: p.id,
      version_number: 1,
    });
    const sfId = uuidv7();
    const sId = uuidv7();
    // Minimal source file + sheet with tiles "produced".
    await tx.execute(
      sql`insert into source_files (id, org_id, plan_set_id, original_filename, mime_type, byte_size, checksum_sha256, storage_key, upload_status) values (${sfId}, ${orgId}, ${ps.id}, 'a.pdf', 'application/pdf', 1, ${'a'.repeat(64)}, 'k', 'UPLOADED')`,
    );
    const prefix = orgStorageKey(orgId, 'plan-sets', ps.id, 'sheets', sId);
    await tx.insert(sheets).values({
      id: sId,
      org_id: orgId,
      plan_set_id: ps.id,
      source_file_id: sfId,
      index_in_set: 0,
      tile_pyramid_key: `${prefix}/tiles.dzi`,
    });
    return { planSetId: ps.id, sheetId: sId };
  });
  const prefix = orgStorageKey(orgId, 'plan-sets', planSetId, 'sheets', sheetId);
  await storage.putObject(
    `${prefix}/tiles_files/8/0_0.png`,
    new Uint8Array([1, 2, 3, 4]),
    'image/png',
  );
  return { orgId, sheetId };
}

describe('getTileObject (P1-06 tile serving)', () => {
  it('serves a tile with the right content type', async () => {
    const { orgId, sheetId } = await makeSheetWithTiles('acme');
    const tile = await getTileObject(app.db, storage, {
      orgId,
      sheetId,
      path: ['tiles_files', '8', '0_0.png'],
    });
    expect(tile.contentType).toBe('image/png');
    expect([...tile.bytes]).toEqual([1, 2, 3, 4]);
  });

  it('rejects path traversal', async () => {
    const { orgId, sheetId } = await makeSheetWithTiles('acme');
    await expect(
      getTileObject(app.db, storage, { orgId, sheetId, path: ['..', 'secret.png'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('404s a missing tile and a sheet in another org (RLS)', async () => {
    const { sheetId } = await makeSheetWithTiles('acme');
    const other = await makeSheetWithTiles('beta');

    await expect(
      getTileObject(app.db, storage, {
        orgId: other.orgId,
        sheetId,
        path: ['tiles_files', '8', '0_0.png'],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' }); // acme's sheet, beta's scope → invisible

    await expect(
      getTileObject(app.db, storage, {
        orgId: other.orgId,
        sheetId: other.sheetId,
        path: ['tiles_files', '9', '9_9.png'],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' }); // missing object
  });
});
