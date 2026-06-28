import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INGESTION_QUEUE } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { S3Storage } from '../../storage';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo, sourceFilesService } from '../source-files';
import type { CloudFileRef } from './provider';
import { cloudImportService, stubCloudProvider } from './index';

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
    sql`TRUNCATE source_files, plan_sets, projects, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

async function setup(): Promise<{ orgId: string; planSetId: string }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: 'imp',
      slug: 'imp',
      owner: { email: 'imp@t.test' },
    })
  ).organization.id;
  const planSetId = await withOrgScope(app.db, orgId, async (tx) => {
    const project = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    const ps = await sourceFilesService.createPlanSet(tx, { projectId: project.id });
    return ps.id;
  });
  return { orgId, planSetId };
}

/** A capturing enqueue so we can assert the ingestion job (the pipeline entry point). */
function captureEnqueue() {
  const jobs: { queue: string; payload: Record<string, unknown> }[] = [];
  return {
    jobs,
    enqueue: async (queue: string, payload: Record<string, unknown>) => {
      jobs.push({ queue, payload });
    },
  };
}

const pdf = (externalId: string): CloudFileRef => ({
  provider: 'GOOGLE_DRIVE',
  externalId,
  filename: `${externalId}.pdf`,
  mimeType: 'application/pdf',
});

describe('cloud-storage import (P5-05)', () => {
  it('produces the same pipeline entry as a direct upload (UPLOADED + ingestion enqueued)', async () => {
    const { orgId, planSetId } = await setup();
    const q = captureEnqueue();

    const view = await cloudImportService.importFile(
      app.db,
      storage,
      orgId,
      { planSetId, fileRef: pdf('plan1') },
      { provider: stubCloudProvider, enqueue: q.enqueue },
    );

    const bytes = Buffer.from('STUB:plan1');
    const checksum = createHash('sha256').update(bytes).digest('hex');

    // The SourceFile lands UPLOADED with the fetched bytes' checksum — identical to a verified upload.
    expect(view).toMatchObject({
      uploadStatus: 'UPLOADED',
      originalFilename: 'plan1.pdf',
      mimeType: 'application/pdf',
      checksumSha256: checksum,
    });

    // Exactly one ingestion job was enqueued (the SAME job a direct upload produces).
    expect(q.jobs).toHaveLength(1);
    expect(q.jobs[0]).toMatchObject({
      queue: INGESTION_QUEUE,
      payload: { sourceFileId: view.id, planSetId, orgId, checksumSha256: checksum },
    });

    // The bytes are actually in our object storage at the enqueued key.
    const storageKey = q.jobs[0]!.payload.storageKey as string;
    const stored = Buffer.from(await storage.getObject(storageKey));
    expect(stored.equals(bytes)).toBe(true);
  });

  it('a permission/fetch failure surfaces clearly and leaves no half-imported set', async () => {
    const { orgId, planSetId } = await setup();
    const q = captureEnqueue();

    const result = await cloudImportService.importFiles(
      app.db,
      storage,
      orgId,
      { planSetId, files: [pdf('good'), pdf('denied'), pdf('missing')] },
      { provider: stubCloudProvider, enqueue: q.enqueue },
    );

    expect(result.imported).toHaveLength(1); // only the good file
    expect(result.failed).toEqual([
      {
        externalId: 'denied',
        code: 'PERMISSION_DENIED',
        message: expect.stringContaining('denied'),
      },
      { externalId: 'missing', code: 'FETCH_FAILED', message: expect.stringContaining('fetch') },
    ]);

    // No half-import: only the successful file produced a row + a job.
    expect(q.jobs).toHaveLength(1);
    const planSet = await withOrgScope(app.db, orgId, (tx) => planSetsRepo.getById(tx, planSetId));
    expect(planSet?.source_file_count).toBe(1);
  });

  it('rejects a disallowed file type — an external source is not trusted (the caveat)', async () => {
    const { orgId, planSetId } = await setup();
    const q = captureEnqueue();

    await expect(
      cloudImportService.importFile(
        app.db,
        storage,
        orgId,
        {
          planSetId,
          fileRef: {
            provider: 'DROPBOX',
            externalId: 'evil',
            filename: 'evil.exe',
            mimeType: 'application/x-msdownload',
          },
        },
        { provider: stubCloudProvider, enqueue: q.enqueue },
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });

    expect(q.jobs).toHaveLength(0); // nothing enqueued for a rejected file
    const planSet = await withOrgScope(app.db, orgId, (tx) => planSetsRepo.getById(tx, planSetId));
    expect(planSet?.source_file_count).toBe(0);
  });

  it('a single import to a missing plan set is rejected', async () => {
    const { orgId } = await setup();
    await expect(
      cloudImportService.importFile(
        app.db,
        storage,
        orgId,
        { planSetId: '019f0000-0000-7000-8000-0000000000ff', fileRef: pdf('x') },
        { provider: stubCloudProvider },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
