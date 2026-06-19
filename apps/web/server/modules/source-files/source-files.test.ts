import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INGESTION_QUEUE, type RequestedFile } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { sourceFiles } from '../../data/schema';
import { getRedis } from '../../redis/client';
import { S3Storage } from '../../storage';
import type { HeadObjectResult, SignedUrl, StorageAdapter } from '../../storage';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { sourceFilesService } from './service';

// getRedis() (used by the service's enqueue) reads REDIS_URL with no default — provide the local
// one when unset, like the DB URLs below. CI already sets REDIS_URL, so ??= leaves it untouched.
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

/** A storage stub whose headObject is whatever the test wants — to drive the rejection paths. */
function fakeStorage(head: HeadObjectResult): StorageAdapter {
  return {
    putObject: async () => undefined,
    getSignedUploadUrl: async (): Promise<SignedUrl> => ({
      url: 'http://fake.local/put',
      expiresInSeconds: 900,
    }),
    getSignedDownloadUrl: async (): Promise<SignedUrl> => ({
      url: 'http://fake.local/get',
      expiresInSeconds: 900,
    }),
    headObject: async () => head,
    getObject: async () => new Uint8Array(),
    listObjects: async () => [],
    deleteObject: async () => undefined,
  };
}

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
    sql`TRUNCATE source_files, plan_sets, projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
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
  const projectId = await withOrgScope(app.db, orgId, async (tx) => {
    const p = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid 1' });
    return p.id;
  });
  return { orgId, projectId };
}

function pdf(name = 'A-101.pdf') {
  const body = Buffer.from(`%PDF-1.4 ${name} ${'x'.repeat(64)}`);
  const checksumSha256 = createHash('sha256').update(body).digest('hex');
  const file: RequestedFile = {
    filename: name,
    mimeType: 'application/pdf',
    byteSize: body.length,
    checksumSha256,
  };
  return { body, file };
}

describe('uploads (P1-01)', () => {
  it('issues a signed URL, accepts the direct PUT, verifies, marks UPLOADED, and enqueues ingestion', async () => {
    const { orgId, projectId } = await setup();
    const { body, file } = pdf();

    const planSetId = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.createPlanSet(tx, { projectId }).then((ps) => ps.id),
    );

    const res = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.createUploadUrls(tx, storage, { planSetId, files: [file] }),
    );
    const target = res.uploads[0]!;

    // Client PUTs the bytes straight to storage with the required headers.
    const put = await fetch(target.uploadUrl, { method: 'PUT', body, headers: target.headers });
    expect(put.ok).toBe(true);

    const view = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.completeUpload(tx, storage, {
        sourceFileId: target.sourceFileId,
        byteSize: file.byteSize,
        checksumSha256: file.checksumSha256,
      }),
    );
    expect(view.uploadStatus).toBe('UPLOADED');

    const raw = await redis.rpop(INGESTION_QUEUE);
    expect(raw).toBeTruthy();
    const job = JSON.parse(raw!);
    expect(job).toMatchObject({ sourceFileId: target.sourceFileId, planSetId, orgId });
    expect(typeof job.correlationId).toBe('string');
  });

  it('rejects an unsupported file type at the boundary — no URL, no row', async () => {
    const { orgId, projectId } = await setup();
    const planSetId = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.createPlanSet(tx, { projectId }).then((ps) => ps.id),
    );

    await expect(
      withOrgScope(app.db, orgId, (tx) =>
        sourceFilesService.createUploadUrls(tx, storage, {
          planSetId,
          files: [
            {
              filename: 'model.dwg',
              mimeType: 'application/acad',
              byteSize: 10,
              checksumSha256: 'a'.repeat(64),
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const count = await admin.db.select({ n: sql<number>`count(*)::int` }).from(sourceFiles);
    expect(count[0]!.n).toBe(0);
  });

  it('rejects a checksum mismatch on completion and marks the file REJECTED', async () => {
    const { orgId, projectId } = await setup();
    const { file } = pdf();
    const planSetId = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.createPlanSet(tx, { projectId }).then((ps) => ps.id),
    );
    const res = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.createUploadUrls(tx, storage, { planSetId, files: [file] }),
    );
    const target = res.uploads[0]!;

    // Storage reports the right size but a different checksum than declared → reject (persisted).
    const stub = fakeStorage({ contentLength: file.byteSize, checksumSha256: 'b'.repeat(64) });
    const view = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.completeUpload(tx, stub, {
        sourceFileId: target.sourceFileId,
        byteSize: file.byteSize,
        checksumSha256: file.checksumSha256,
      }),
    );
    expect(view.uploadStatus).toBe('REJECTED');

    const row = await withOrgScope(app.db, orgId, (tx) =>
      tx.query.sourceFiles.findFirst({ where: eq(sourceFiles.id, target.sourceFileId) }),
    );
    expect(row?.upload_status).toBe('REJECTED');
    expect(row?.error_detail).toMatch(/checksum/i);
    expect(await redis.llen(INGESTION_QUEUE)).toBe(0);
  });

  it('rejects a size mismatch on completion', async () => {
    const { orgId, projectId } = await setup();
    const { file } = pdf();
    const planSetId = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.createPlanSet(tx, { projectId }).then((ps) => ps.id),
    );
    const res = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.createUploadUrls(tx, storage, { planSetId, files: [file] }),
    );
    const target = res.uploads[0]!;

    const stub = fakeStorage({
      contentLength: file.byteSize + 999,
      checksumSha256: file.checksumSha256,
    });
    const view = await withOrgScope(app.db, orgId, (tx) =>
      sourceFilesService.completeUpload(tx, stub, {
        sourceFileId: target.sourceFileId,
        byteSize: file.byteSize,
        checksumSha256: file.checksumSha256,
      }),
    );
    expect(view.uploadStatus).toBe('REJECTED');
  });
});
