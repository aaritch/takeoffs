import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { S3Storage } from '../../storage';
import { orgStorageKey } from '../../storage/keys';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo, sourceFilesRepo } from '../source-files/repository';
import { extensionOf } from '../source-files/validation';
import { ingestSourceFile } from './pipeline';
import { defaultRasterizer } from './rasterizer';
import { defaultTiler } from './tiler';
import { sheetsRepo } from './repository';

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

async function setup(slug = 'acme') {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;
  const planSetId = await withOrgScope(app.db, orgId, async (tx) => {
    const p = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid 1' });
    const ps = await planSetsRepo.insert(tx, {
      org_id: orgId,
      project_id: p.id,
      version_number: 1,
    });
    return ps.id;
  });
  return { orgId, planSetId };
}

async function seedFile(
  orgId: string,
  planSetId: string,
  opts: { filename: string; mimeType: string; bytes: Uint8Array },
): Promise<string> {
  const id = uuidv7();
  const key = orgStorageKey(orgId, 'plan-sets', planSetId, `${id}${extensionOf(opts.filename)}`);
  await storage.putObject(key, opts.bytes, opts.mimeType);
  await withOrgScope(app.db, orgId, (tx) =>
    sourceFilesRepo.insert(tx, {
      id,
      org_id: orgId,
      plan_set_id: planSetId,
      original_filename: opts.filename,
      mime_type: opts.mimeType,
      byte_size: opts.bytes.length,
      checksum_sha256: createHash('sha256').update(opts.bytes).digest('hex'),
      storage_key: key,
      upload_status: 'UPLOADED',
    }),
  );
  return id;
}

describe('rasterize & tile (P1-03)', () => {
  it('renders each page to a DZI pyramid + thumbnail and records dimensions/DPI', async () => {
    const { orgId, planSetId } = await setup();
    const doc = await PDFDocument.create();
    for (let i = 0; i < 2; i++) {
      const page = doc.addPage([612, 792]);
      page.drawRectangle({ x: 50, y: 50, width: 300, height: 200, color: rgb(0.1, 0.3, 0.7) });
    }
    const sourceFileId = await seedFile(orgId, planSetId, {
      filename: 'A-101.pdf',
      mimeType: 'application/pdf',
      bytes: await doc.save(),
    });

    const result = await ingestSourceFile(
      { db: app.db, storage, rasterizer: defaultRasterizer, tiler: defaultTiler },
      { orgId, sourceFileId },
    );
    expect(result).toMatchObject({ status: 'PROCESSED', sheetCount: 2 });

    const sheets = await withOrgScope(app.db, orgId, (tx) =>
      sheetsRepo.listByPlanSet(tx, planSetId),
    );
    expect(sheets).toHaveLength(2);

    for (const s of sheets) {
      // 612pt × 150dpi/72 = 1275px wide, 1650px tall.
      expect(s.width_px).toBe(1275);
      expect(s.height_px).toBe(1650);
      expect(s.dpi).toBe(150);
      expect(s.tile_pyramid_key).toMatch(/tiles\.dzi$/);
      expect(s.thumbnail_key).toMatch(/thumbnail\.png$/);

      const prefix = orgStorageKey(orgId, 'plan-sets', planSetId, 'sheets', s.id);
      const keys = await storage.listObjects(prefix);
      expect(keys).toContain(`${prefix}/tiles.dzi`);
      expect(keys).toContain(`${prefix}/thumbnail.png`);

      // Tiles exist across multiple zoom levels (the DZI pyramid).
      const levels = new Set(
        keys
          .map((k) => k.split('/tiles_files/')[1])
          .filter((x): x is string => Boolean(x))
          .map((rest) => rest.split('/')[0])
          .filter((x): x is string => Boolean(x)),
      );
      expect(levels.size).toBeGreaterThanOrEqual(2);

      // The thumbnail is a real image, oriented within the 256px bound.
      const thumb = await storage.getObject(s.thumbnail_key!);
      const meta = await sharp(Buffer.from(thumb)).metadata();
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(256);
      expect(meta.width ?? 0).toBeGreaterThan(0);
    }
  });

  it('tiles a raster image source too (single page, EXIF-oriented)', async () => {
    const { orgId, planSetId } = await setup();
    const png = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 240, g: 240, b: 240 } },
    })
      .png()
      .toBuffer();
    const sourceFileId = await seedFile(orgId, planSetId, {
      filename: 'detail.png',
      mimeType: 'image/png',
      bytes: new Uint8Array(png),
    });

    const result = await ingestSourceFile(
      { db: app.db, storage, rasterizer: defaultRasterizer, tiler: defaultTiler },
      { orgId, sourceFileId },
    );
    expect(result).toMatchObject({ status: 'PROCESSED', sheetCount: 1 });

    const sheets = await withOrgScope(app.db, orgId, (tx) =>
      sheetsRepo.listByPlanSet(tx, planSetId),
    );
    expect(sheets[0]).toMatchObject({ width_px: 800, height_px: 600, dpi: 150 });
    expect(sheets[0]!.tile_pyramid_key).toBeTruthy();
  });
});
