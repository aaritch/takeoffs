import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { S3Storage } from '../../storage';
import { orgStorageKey } from '../../storage/keys';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo, sourceFilesRepo } from '../source-files/repository';
import { ingestSourceFile } from './pipeline';
import { defaultExtractor } from './extractor';
import { extractAndApply, updateSheetMetadata } from './metadata';
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

async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  lines.forEach((line, i) => page.drawText(line, { x: 430, y: 60 - i * 16, size: 12, font }));
  return doc.save();
}

async function seedFile(orgId: string, planSetId: string, bytes: Uint8Array): Promise<string> {
  const id = uuidv7();
  const key = orgStorageKey(orgId, 'plan-sets', planSetId, `${id}.pdf`);
  await storage.putObject(key, bytes, 'application/pdf');
  await withOrgScope(app.db, orgId, (tx) =>
    sourceFilesRepo.insert(tx, {
      id,
      org_id: orgId,
      plan_set_id: planSetId,
      original_filename: 'A.pdf',
      mime_type: 'application/pdf',
      byte_size: bytes.length,
      checksum_sha256: createHash('sha256').update(bytes).digest('hex'),
      storage_key: key,
      upload_status: 'UPLOADED',
    }),
  );
  return id;
}

const onlySheet = (orgId: string, planSetId: string) =>
  withOrgScope(app.db, orgId, (tx) => sheetsRepo.listByPlanSet(tx, planSetId)).then((s) => s[0]!);

describe('sheet metadata extraction (P1-04)', () => {
  it('extracts number/title/discipline candidates and writes a search entry', async () => {
    const { orgId, planSetId } = await setup();
    const id = await seedFile(orgId, planSetId, await textPdf(['A-101', 'FLOOR PLAN']));

    await ingestSourceFile(
      { db: app.db, storage, extractor: defaultExtractor },
      { orgId, sourceFileId: id },
    );

    const sheet = await onlySheet(orgId, planSetId);
    expect(sheet.sheet_number).toBe('A-101');
    expect(sheet.sheet_title).toBe('FLOOR PLAN');
    expect(sheet.discipline).toBe('ARCHITECTURAL');
    expect(sheet.sheet_number_source).toBe('EXTRACTED');
    expect(sheet.search_text).toContain('a-101');
    expect(sheet.search_text).toContain('floor plan');
  });

  it('keeps a user edit and does not let re-extraction overwrite it', async () => {
    const { orgId, planSetId } = await setup();
    const id = await seedFile(orgId, planSetId, await textPdf(['A-101', 'FLOOR PLAN']));
    await ingestSourceFile(
      { db: app.db, storage, extractor: defaultExtractor },
      { orgId, sourceFileId: id },
    );
    const sheet = await onlySheet(orgId, planSetId);

    // User renames the title.
    const view = await withOrgScope(app.db, orgId, (tx) =>
      updateSheetMetadata(tx, sheet.id, { sheetTitle: 'LEVEL 1 — OVERALL' }),
    );
    expect(view.sheetTitle).toBe('LEVEL 1 — OVERALL');

    // Reprocessing extraction must NOT clobber the user's title (but may refresh other fields).
    await extractAndApply(
      { db: app.db, storage, extractor: defaultExtractor },
      { orgId, sourceFileId: id },
    );
    const after = await onlySheet(orgId, planSetId);
    expect(after.sheet_title).toBe('LEVEL 1 — OVERALL');
    expect(after.sheet_title_source).toBe('USER');
    expect(after.sheet_number).toBe('A-101'); // still extracted
    expect(after.search_text).toContain('level 1');
  });

  it('degrades gracefully to a blank, editable sheet when nothing is recognized', async () => {
    const { orgId, planSetId } = await setup();
    const id = await seedFile(orgId, planSetId, await textPdf([])); // blank page, no text

    const result = await ingestSourceFile(
      { db: app.db, storage, extractor: defaultExtractor },
      { orgId, sourceFileId: id },
    );
    expect(result.status).toBe('PROCESSED');

    const sheet = await onlySheet(orgId, planSetId);
    expect(sheet.sheet_number).toBeNull();
    expect(sheet.sheet_title).toBeNull();
    expect(sheet.discipline).toBe('UNKNOWN');

    // Still editable afterwards.
    const view = await withOrgScope(app.db, orgId, (tx) =>
      updateSheetMetadata(tx, sheet.id, { sheetNumber: 'A-999' }),
    );
    expect(view.sheetNumber).toBe('A-999');
  });
});
