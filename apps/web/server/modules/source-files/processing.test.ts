import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INGESTION_QUEUE } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { sheets } from '../../data/schema';
import { getRedis } from '../../redis/client';
import { accountsService } from '../accounts';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo, sourceFilesRepo } from './repository';
import { getPlanSetStatus, retrySourceFile } from './processing';

process.env.REDIS_URL ??= 'redis://localhost:6379';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

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

async function setup() {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: 'acme',
      slug: 'acme',
      owner: { email: 'acme@t.test' },
    })
  ).organization.id;
  const planSetId = await withOrgScope(app.db, orgId, async (tx) => {
    const p = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid 1' });
    const ps = await planSetsRepo.insert(tx, {
      org_id: orgId,
      project_id: p.id,
      version_number: 1,
      processing_status: 'PARTIAL',
    });
    return ps.id;
  });
  return { orgId, planSetId };
}

function seedFile(
  orgId: string,
  planSetId: string,
  over: { ingest_status: 'PROCESSED' | 'FAILED'; error_detail?: string },
) {
  return withOrgScope(app.db, orgId, (tx) =>
    sourceFilesRepo
      .insert(tx, {
        id: uuidv7(),
        org_id: orgId,
        plan_set_id: planSetId,
        original_filename: 'f.pdf',
        mime_type: 'application/pdf',
        byte_size: 10,
        checksum_sha256: 'a'.repeat(64),
        storage_key: 'org/x/f.pdf',
        ...over,
      })
      .then((f) => f.id),
  );
}

function seedSheet(
  orgId: string,
  planSetId: string,
  sourceFileId: string,
  opts: { indexInSet: number; ready: boolean },
) {
  return withOrgScope(app.db, orgId, (tx) =>
    tx.insert(sheets).values({
      org_id: orgId,
      plan_set_id: planSetId,
      source_file_id: sourceFileId,
      index_in_set: opts.indexInSet,
      ...(opts.ready ? { tile_pyramid_key: 'k/tiles.dzi', thumbnail_key: 'k/thumbnail.png' } : {}),
    }),
  );
}

describe('processing status + retry (P1-05)', () => {
  it('reports granular per-file and per-sheet status, with ready flags', async () => {
    const { orgId, planSetId } = await setup();
    const ok = await seedFile(orgId, planSetId, { ingest_status: 'PROCESSED' });
    await seedSheet(orgId, planSetId, ok, { indexInSet: 0, ready: true });
    await seedSheet(orgId, planSetId, ok, { indexInSet: 1, ready: false });
    const bad = await seedFile(orgId, planSetId, {
      ingest_status: 'FAILED',
      error_detail: 'Unreadable PDF',
    });

    const view = await withOrgScope(app.db, orgId, (tx) => getPlanSetStatus(tx, planSetId));
    expect(view.planSet.processingStatus).toBe('PARTIAL');
    expect(view.sourceFiles).toHaveLength(2);

    const okFile = view.sourceFiles.find((f) => f.id === ok)!;
    expect(okFile.ingestStatus).toBe('PROCESSED');
    expect(okFile.sheets.map((s) => s.ready)).toEqual([true, false]); // first sheet viewable early

    const badFile = view.sourceFiles.find((f) => f.id === bad)!;
    expect(badFile.ingestStatus).toBe('FAILED');
    expect(badFile.errorDetail).toBe('Unreadable PDF');
    expect(badFile.sheets).toHaveLength(0);
  });

  it('retries a FAILED file: resets to PENDING, clears the error, and re-enqueues', async () => {
    const { orgId, planSetId } = await setup();
    const bad = await seedFile(orgId, planSetId, { ingest_status: 'FAILED', error_detail: 'boom' });

    await retrySourceFile(app.db, { orgId, sourceFileId: bad });

    const sf = await withOrgScope(app.db, orgId, (tx) => sourceFilesRepo.getById(tx, bad));
    expect(sf?.ingest_status).toBe('PENDING');
    expect(sf?.error_detail).toBeNull();

    const raw = await redis.rpop(INGESTION_QUEUE);
    expect(JSON.parse(raw!)).toMatchObject({ sourceFileId: bad, planSetId, orgId });
  });

  it('refuses to retry a file that is not FAILED', async () => {
    const { orgId, planSetId } = await setup();
    const ok = await seedFile(orgId, planSetId, { ingest_status: 'PROCESSED' });
    await expect(retrySourceFile(app.db, { orgId, sourceFileId: ok })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
