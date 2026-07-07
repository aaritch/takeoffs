import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { SourceFileError } from '../source-files/errors';
import { modelRegistryService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(sql`TRUNCATE model_versions RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await admin.pool.end();
});

const register = (family: string, version: string, metrics: Record<string, number>) =>
  modelRegistryService.registerCandidate(admin.db, {
    modelFamily: family,
    version,
    metrics,
    benchmarkId: 'bench-v1',
  });

describe('model registry (P4-06)', () => {
  it('registers a candidate as CANDIDATE and rejects a duplicate (family, version)', async () => {
    const c = await register('classify', '1.0.0', { precision: 0.9 });
    expect(c.status).toBe('CANDIDATE');
    expect(c.activated_at).toBeNull();

    await expect(register('classify', '1.0.0', { precision: 0.95 })).rejects.toBeInstanceOf(
      SourceFileError,
    );
  });

  it('promotes the first version for a family unconditionally (no incumbent)', async () => {
    await register('classify', '1.0.0', { precision: 0.9 });
    const active = await modelRegistryService.promote(admin.db, 'classify', '1.0.0');
    expect(active.status).toBe('ACTIVE');
    expect(active.previous_active_id).toBeNull();
    expect(active.activated_at).not.toBeNull();
  });

  it('blocks promotion of a model that regresses any tracked benchmark metric', async () => {
    await register('classify', '1.0.0', { precision: 0.9, recall: 0.85 });
    await modelRegistryService.promote(admin.db, 'classify', '1.0.0');

    // Candidate improves precision but regresses recall — must be blocked, serving unchanged.
    await register('classify', '2.0.0', { precision: 0.95, recall: 0.8 });
    await expect(modelRegistryService.promote(admin.db, 'classify', '2.0.0')).rejects.toMatchObject(
      { code: 'VALIDATION_FAILED' },
    );

    const serving = await modelRegistryService.activeVersion(admin.db, 'classify');
    expect(serving?.version).toBe('1.0.0');
    const blocked = (await modelRegistryService.listByFamily(admin.db, 'classify')).find(
      (m) => m.version === '2.0.0',
    );
    expect(blocked?.status).toBe('CANDIDATE');
  });

  it('promotes a non-regressing candidate, retiring the prior active and linking predecessor', async () => {
    await register('classify', '1.0.0', { precision: 0.9, recall: 0.85 });
    const v1 = await modelRegistryService.promote(admin.db, 'classify', '1.0.0');

    await register('classify', '2.0.0', { precision: 0.93, recall: 0.86 });
    const v2 = await modelRegistryService.promote(admin.db, 'classify', '2.0.0');

    expect(v2.status).toBe('ACTIVE');
    expect(v2.previous_active_id).toBe(v1.id);

    const versions = await modelRegistryService.listByFamily(admin.db, 'classify');
    expect(versions.find((m) => m.version === '1.0.0')?.status).toBe('RETIRED');
    // Exactly one ACTIVE per family.
    expect(versions.filter((m) => m.status === 'ACTIVE')).toHaveLength(1);
  });

  it('rolls back to the superseded version immediately (a version switch, not a redeploy)', async () => {
    await register('classify', '1.0.0', { precision: 0.9 });
    await modelRegistryService.promote(admin.db, 'classify', '1.0.0');
    await register('classify', '2.0.0', { precision: 0.95 });
    await modelRegistryService.promote(admin.db, 'classify', '2.0.0');

    const restored = await modelRegistryService.rollback(admin.db, 'classify');
    expect(restored.version).toBe('1.0.0');
    expect(restored.status).toBe('ACTIVE');

    const serving = await modelRegistryService.activeVersion(admin.db, 'classify');
    expect(serving?.version).toBe('1.0.0');
    const versions = await modelRegistryService.listByFamily(admin.db, 'classify');
    expect(versions.find((m) => m.version === '2.0.0')?.status).toBe('ROLLED_BACK');
  });

  it('refuses to roll back a family whose active version has no predecessor', async () => {
    await register('scale', '1.0.0', { accuracy: 0.9 });
    await modelRegistryService.promote(admin.db, 'scale', '1.0.0');
    await expect(modelRegistryService.rollback(admin.db, 'scale')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('exposes the active serving version map across families (stamped onto each run)', async () => {
    await register('classify', '1.0.0', { precision: 0.9 });
    await modelRegistryService.promote(admin.db, 'classify', '1.0.0');
    await register('scale', '3.1.0', { accuracy: 0.88 });
    await modelRegistryService.promote(admin.db, 'scale', '3.1.0');
    // A registered-but-unpromoted candidate must not appear in the serving map.
    await register('symbols', '0.9.0', { map: 0.5 });

    const serving = await modelRegistryService.activeServingVersions(admin.db);
    expect(serving).toEqual({ classify: '1.0.0', scale: '3.1.0' });
  });
});
