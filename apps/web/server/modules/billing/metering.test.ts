import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PlanTier, UsageMetric } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { projects, takeoffs, usageRecords } from '../../data/schema';
import { planSetsRepo } from '../source-files/repository';
import { accountsService } from '../accounts';
import { aiRunsService } from '../ai-runs';
import { reportsService } from '../reports';
import { meteringService } from './metering';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;

/** Fixed timestamp → deterministic billing period '2026-06'. */
const AT = new Date('2026-06-15T12:00:00Z');
const PERIOD = '2026-06';

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE usage_records, model_runs, reports, takeoffs, sheets, source_files, plan_sets, projects, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

async function org(slug: string, planTier: PlanTier): Promise<string> {
  const { organization } = await accountsService.createOrganizationWithOwner(admin.db, {
    name: slug,
    slug,
    owner: { email: `${slug}@t.test` },
    planTier,
  });
  return organization.id;
}

const meter = (orgId: string, metric: UsageMetric, referenceId: string) =>
  admin.db.transaction((tx) => meteringService.meter(tx, { orgId, metric, referenceId, at: AT }));

const usageFor = (orgId: string, metric: UsageMetric) =>
  admin.db.query.usageRecords.findMany({
    where: and(eq(usageRecords.org_id, orgId), eq(usageRecords.metric, metric)),
  });

describe('usage metering & quotas (P4-02)', () => {
  it('meters a billable event exactly once — a retried action does not double-count', async () => {
    const orgId = await org('once', 'PRO');
    const ref = uuidv7();
    await meter(orgId, 'AI_TAKEOFF_RUN', ref);
    await meter(orgId, 'AI_TAKEOFF_RUN', ref); // same action id re-run

    const rows = await usageFor(orgId, 'AI_TAKEOFF_RUN');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period: PERIOD, quantity: 1, billed: false });
  });

  it('blocks an AI run when the plan excludes it (FREE), writing no usage', async () => {
    const orgId = await org('block', 'FREE'); // FREE: aiTakeoffRunsPerMonth = 0
    await expect(meter(orgId, 'AI_TAKEOFF_RUN', uuidv7())).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    expect(await usageFor(orgId, 'AI_TAKEOFF_RUN')).toHaveLength(0);
  });

  it('allows exports past the quota but flags the overage as billed', async () => {
    const orgId = await org('overage', 'FREE'); // FREE: exportsPerMonth = 5
    for (let i = 0; i < 5; i++) await meter(orgId, 'EXPORT', uuidv7());
    const sixth = await meter(orgId, 'EXPORT', uuidv7());

    expect(sixth.outcome).toBe('ALLOW_OVERAGE');
    const rows = await usageFor(orgId, 'EXPORT');
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.billed)).toHaveLength(1); // only the 6th is an overage
  });

  it('always meters managed orders (never count-capped)', async () => {
    const orgId = await org('mo', 'FREE');
    for (let i = 0; i < 3; i++) {
      const d = await meter(orgId, 'MANAGED_ORDER', uuidv7());
      expect(d.outcome).toBe('ALLOW');
    }
    expect(await usageFor(orgId, 'MANAGED_ORDER')).toHaveLength(3);
  });

  it('counts usage per billing period (a new month resets the window)', async () => {
    const orgId = await org('period', 'STARTER');
    await admin.db.transaction((tx) =>
      meteringService.meter(tx, {
        orgId,
        metric: 'EXPORT',
        referenceId: uuidv7(),
        at: new Date('2026-06-30T12:00:00Z'),
      }),
    );
    await admin.db.transaction((tx) =>
      meteringService.meter(tx, {
        orgId,
        metric: 'EXPORT',
        referenceId: uuidv7(),
        at: new Date('2026-07-01T00:00:00Z'),
      }),
    );
    const junUsage = await admin.db.transaction((tx) =>
      meteringService.summarize(tx, orgId, new Date('2026-06-15T00:00:00Z')),
    );
    const julUsage = await admin.db.transaction((tx) =>
      meteringService.summarize(tx, orgId, new Date('2026-07-15T00:00:00Z')),
    );
    expect(junUsage.metrics.find((m) => m.metric === 'EXPORT')?.used).toBe(1);
    expect(julUsage.metrics.find((m) => m.metric === 'EXPORT')?.used).toBe(1);
  });

  it('summarizes current usage vs plan limits for the customer', async () => {
    const orgId = await org('summary', 'STARTER'); // exports/mo = 50
    await meter(orgId, 'EXPORT', uuidv7());
    const summary = await admin.db.transaction((tx) => meteringService.summarize(tx, orgId, AT));

    expect(summary).toMatchObject({ period: PERIOD, planTier: 'STARTER' });
    const exports = summary.metrics.find((m) => m.metric === 'EXPORT')!;
    expect(exports).toMatchObject({ used: 1, limit: 50, remaining: 49, overQuota: false });
    const managed = summary.metrics.find((m) => m.metric === 'MANAGED_ORDER')!;
    expect(managed).toMatchObject({ limit: -1, remaining: -1 });
  });

  // --- wiring: the real billable actions meter through this seam ---

  it('the export action meters exactly one record per report (reconciles to actions)', async () => {
    const orgId = await org('reports', 'FREE');
    const [project] = await admin.db
      .insert(projects)
      .values({ org_id: orgId, name: 'Bid' })
      .returning();
    const planSet = await admin.db.transaction((tx) =>
      planSetsRepo.insert(tx, { org_id: orgId, project_id: project!.id, version_number: 1 }),
    );
    const [takeoff] = await admin.db
      .insert(takeoffs)
      .values({
        org_id: orgId,
        project_id: project!.id,
        plan_set_id: planSet.id,
        origin: 'SELF_SERVE',
      })
      .returning();

    for (let i = 0; i < 6; i++) {
      await withOrgScope(app.db, orgId, (tx) =>
        reportsService.requestReport(tx, { takeoffId: takeoff!.id, template: 'SUMMARY' }),
      );
    }
    const reports = await admin.db.query.reports.findMany();
    const usage = await usageFor(orgId, 'EXPORT');
    expect(usage).toHaveLength(reports.length); // one usage record per export action
    expect(usage.filter((r) => r.billed)).toHaveLength(1); // the 6th exceeded the FREE quota of 5
  });

  it('the AI-run action is blocked when the plan excludes AI, and rolls back the run', async () => {
    const orgId = await org('airun', 'FREE');
    const [project] = await admin.db
      .insert(projects)
      .values({ org_id: orgId, name: 'Bid' })
      .returning();
    const planSet = await admin.db.transaction((tx) =>
      planSetsRepo.insert(tx, { org_id: orgId, project_id: project!.id, version_number: 1 }),
    );

    await expect(
      withOrgScope(app.db, orgId, (tx) =>
        aiRunsService.startRun(tx, { planSetId: planSet.id, pipelineVersion: 'p-1' }),
      ),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });

    // The run was rolled back with the quota failure — no model run, no usage.
    const runs = await admin.db.query.modelRuns.findMany();
    expect(runs).toHaveLength(0);
    expect(await usageFor(orgId, 'AI_TAKEOFF_RUN')).toHaveLength(0);
  });
});
