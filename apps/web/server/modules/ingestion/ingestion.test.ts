import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PDFDocument } from 'pdf-lib';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { sheets } from '../../data/schema';
import { S3Storage } from '../../storage';
import { orgStorageKey } from '../../storage/keys';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo, sourceFilesRepo } from '../source-files/repository';
import { INGESTION_QUEUE } from '@takeoff/contracts';
import { getRedis } from '../../redis/client';
import { enqueue } from '../../platform/queue';
import { ingestSourceFile } from './pipeline';
import { drainOne } from './consumer';
import { sheetsRepo } from './repository';
import { extensionOf } from '../source-files/validation';
import type { IngestFailureNotice, Notifier } from './notifier';

process.env.REDIS_URL ??= 'redis://localhost:6379';

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

function recordingNotifier(): { notifier: Notifier; calls: IngestFailureNotice[] } {
  const calls: IngestFailureNotice[] = [];
  return { notifier: { ingestFailed: async (n) => void calls.push(n) }, calls };
}

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  return doc.save();
}

const EICAR_BYTES = new TextEncoder().encode(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}' + '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
);

let admin: DbHandle;
let app: DbHandle;
const redis = getRedis();

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE sheets, source_files, plan_sets, projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
  await redis.del(INGESTION_QUEUE);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
  redis.disconnect();
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

/** Seed an already-UPLOADED source file: bytes in storage + a row in UPLOADED/PENDING. */
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

describe('ingestion pipeline (P1-02)', () => {
  it('splits a multi-page PDF into the right number of Sheet rows, in order', async () => {
    const { orgId, planSetId } = await setup();
    const sourceFileId = await seedFile(orgId, planSetId, {
      filename: 'A-101.pdf',
      mimeType: 'application/pdf',
      bytes: await makePdf(3),
    });

    const result = await ingestSourceFile({ db: app.db, storage }, { orgId, sourceFileId });
    expect(result).toMatchObject({ status: 'PROCESSED', sheetCount: 3 });

    const sheets = await withOrgScope(app.db, orgId, (tx) =>
      sheetsRepo.listByPlanSet(tx, planSetId),
    );
    expect(sheets.map((s) => s.index_in_set)).toEqual([0, 1, 2]);

    const ps = await withOrgScope(app.db, orgId, (tx) => planSetsRepo.getById(tx, planSetId));
    expect(ps?.processing_status).toBe('READY');
    expect(ps?.total_sheet_count).toBe(3);
  });

  it('halts a malware-flagged file (FAILED) and notifies the uploader', async () => {
    const { orgId, planSetId } = await setup();
    const sourceFileId = await seedFile(orgId, planSetId, {
      filename: 'infected.pdf',
      mimeType: 'application/pdf',
      bytes: EICAR_BYTES,
    });
    const { notifier, calls } = recordingNotifier();

    const result = await ingestSourceFile(
      { db: app.db, storage, notifier },
      { orgId, sourceFileId },
    );
    expect(result.status).toBe('FAILED');

    const sf = await withOrgScope(app.db, orgId, (tx) => sourceFilesRepo.getById(tx, sourceFileId));
    expect(sf?.ingest_status).toBe('FAILED');
    expect(sf?.error_detail).toMatch(/malware/i);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ sourceFileId, reason: expect.stringMatching(/malware/i) });

    const sheets = await withOrgScope(app.db, orgId, (tx) =>
      sheetsRepo.listByPlanSet(tx, planSetId),
    );
    expect(sheets).toHaveLength(0);
    const ps = await withOrgScope(app.db, orgId, (tx) => planSetsRepo.getById(tx, planSetId));
    expect(ps?.processing_status).toBe('PARTIAL');
  });

  it('is idempotent — re-running an already-processed file is a no-op', async () => {
    const { orgId, planSetId } = await setup();
    const sourceFileId = await seedFile(orgId, planSetId, {
      filename: 'A-101.pdf',
      mimeType: 'application/pdf',
      bytes: await makePdf(2),
    });

    const first = await ingestSourceFile({ db: app.db, storage }, { orgId, sourceFileId });
    expect(first.status).toBe('PROCESSED');
    const second = await ingestSourceFile({ db: app.db, storage }, { orgId, sourceFileId });
    expect(second).toMatchObject({ status: 'SKIPPED', sheetCount: 2 });

    // No duplicates: total sheet rows must still be exactly 2.
    const count = await admin.db.select({ n: sql<number>`count(*)::int` }).from(sheets);
    expect(count[0]!.n).toBe(2);
  });

  it('fails one corrupt file without taking down the rest of the plan set (PARTIAL)', async () => {
    const { orgId, planSetId } = await setup();
    const good = await seedFile(orgId, planSetId, {
      filename: 'good.pdf',
      mimeType: 'application/pdf',
      bytes: await makePdf(2),
    });
    const bad = await seedFile(orgId, planSetId, {
      filename: 'corrupt.pdf',
      mimeType: 'application/pdf',
      bytes: new TextEncoder().encode('this is not a pdf'),
    });

    const goodResult = await ingestSourceFile(
      { db: app.db, storage },
      { orgId, sourceFileId: good },
    );
    const badResult = await ingestSourceFile({ db: app.db, storage }, { orgId, sourceFileId: bad });
    expect(goodResult.status).toBe('PROCESSED');
    expect(badResult.status).toBe('FAILED');

    const sheets = await withOrgScope(app.db, orgId, (tx) =>
      sheetsRepo.listByPlanSet(tx, planSetId),
    );
    expect(sheets).toHaveLength(2); // only the good file's pages
    const ps = await withOrgScope(app.db, orgId, (tx) => planSetsRepo.getById(tx, planSetId));
    expect(ps?.processing_status).toBe('PARTIAL');
  });

  it('drains an enqueued ingestion job end to end (the producer→consumer loop)', async () => {
    const { orgId, planSetId } = await setup();
    const sourceFileId = await seedFile(orgId, planSetId, {
      filename: 'A-101.pdf',
      mimeType: 'application/pdf',
      bytes: await makePdf(2),
    });
    // The API enqueues this on completeUpload (P1-01); enqueue stamps the correlation id.
    await enqueue(INGESTION_QUEUE, {
      sourceFileId,
      planSetId,
      orgId,
      storageKey: 'x',
      checksumSha256: 'a'.repeat(64),
    });

    const result = await drainOne({ db: app.db, storage });
    expect(result).toMatchObject({ status: 'PROCESSED', sheetCount: 2 });

    const sf = await withOrgScope(app.db, orgId, (tx) => sourceFilesRepo.getById(tx, sourceFileId));
    expect(sf?.ingest_status).toBe('PROCESSED');

    // Queue is now empty → draining again returns null (nothing to do).
    expect(await drainOne({ db: app.db, storage })).toBeNull();
  });
});
