import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderPriority, ServiceTier } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { pricingRules } from '../../data/schema';
import { accountsService } from '../accounts';
import { sheetsRepo } from '../ingestion';
import { ordersService, type Actor } from '../orders';
import { projectsRepo } from '../projects/repository';
import { planSetsRepo, sourceFilesRepo } from '../source-files/repository';
import {
  PRICING_SEED,
  pricingRulesRepo,
  seedGlobalPricingRules,
  validatePricingRule,
} from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;
const actor: Actor = { userId: uuidv7(), role: 'PLATFORM_ADMIN' };

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE pricing_rules, order_events, orders, sheets, source_files, plan_sets, projects, memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalPricingRules(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

/** Org + project + plan set + a source file + `sheetCount` sheets. Returns ids. */
async function setup(
  slug: string,
  sheetCount: number,
): Promise<{ orgId: string; projectId: string; planSetId: string }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `${slug}@t.test` },
    })
  ).organization.id;
  return withOrgScope(app.db, orgId, async (tx) => {
    const project = await projectsRepo.insert(tx, { org_id: orgId, name: 'Bid' });
    const planSet = await planSetsRepo.insert(tx, {
      org_id: orgId,
      project_id: project.id,
      version_number: 1,
    });
    const sourceFileId = uuidv7();
    await sourceFilesRepo.insert(tx, {
      id: sourceFileId,
      org_id: orgId,
      plan_set_id: planSet.id,
      original_filename: 'A.pdf',
      mime_type: 'application/pdf',
      byte_size: 1,
      checksum_sha256: 'a'.repeat(64),
      storage_key: `org/${orgId}/x`,
      upload_status: 'UPLOADED',
    });
    if (sheetCount > 0) {
      await sheetsRepo.insertMany(
        tx,
        Array.from({ length: sheetCount }, (_, i) => ({
          org_id: orgId,
          plan_set_id: planSet.id,
          source_file_id: sourceFileId,
          index_in_set: i,
        })),
      );
    }
    return { orgId, projectId: project.id, planSetId: planSet.id };
  });
}

async function createOrder(
  orgId: string,
  projectId: string,
  planSetId: string,
  serviceTier: ServiceTier,
  priority: OrderPriority,
  tradeCount: number,
) {
  return withOrgScope(app.db, orgId, (tx) =>
    ordersService.create(
      tx,
      {
        projectId,
        planSetId,
        serviceTier,
        requestedTrades: Array.from({ length: tradeCount }, () => uuidv7()),
        priority,
      },
      actor,
    ),
  );
}

const quote = (orgId: string, orderId: string) =>
  withOrgScope(app.db, orgId, (tx) => ordersService.quote(tx, orderId, actor));

describe('pricing & turnaround rules (P3-02)', () => {
  it('seeds the default rules idempotently, and every seed row is valid', async () => {
    for (const r of PRICING_SEED) expect(() => validatePricingRule(r)).not.toThrow();
    await seedGlobalPricingRules(admin.db); // run again
    const rules = await withOrgScope(app.db, (await setup('seed', 0)).orgId, (tx) =>
      pricingRulesRepo.list(tx),
    );
    expect(rules).toHaveLength(PRICING_SEED.length);
  });

  it('quotes a DRAFT order from the rules and moves it to QUOTED', async () => {
    const { orgId, projectId, planSetId } = await setup('quote', 3);
    const order = await createOrder(orgId, projectId, planSetId, 'FULL_PROJECT', 'STANDARD', 2);

    const quoted = await quote(orgId, order.id);
    expect(quoted.status).toBe('QUOTED');
    // FULL_PROJECT/STANDARD: 40000 + 5000·2 + 300·3 = 50,900 ; 72 + 4·2 + 1·3 = 83h.
    expect(quoted.price_quote_minor).toBe(50900);
    expect(quoted.promised_turnaround_hours).toBe(83);

    const events = await withOrgScope(app.db, orgId, (tx) =>
      ordersService.listEvents(tx, order.id),
    );
    expect(events.at(-1)).toMatchObject({ to_status: 'QUOTED', event_type: 'TRANSITION' });
  });

  it('changing a rule value changes the quote — no code change', async () => {
    await admin.db
      .update(pricingRules)
      .set({ base_price_minor: 99000 })
      .where(
        and(eq(pricingRules.service_tier, 'FULL_PROJECT'), eq(pricingRules.priority, 'STANDARD')),
      );

    const { orgId, projectId, planSetId } = await setup('tune', 0);
    const order = await createOrder(orgId, projectId, planSetId, 'FULL_PROJECT', 'STANDARD', 0);
    const quoted = await quote(orgId, order.id);
    expect(quoted.price_quote_minor).toBe(99000); // the new base, with 0 trades/sheets
  });

  it('a RUSH order is priced higher and promised sooner than the same STANDARD order', async () => {
    const { orgId, projectId, planSetId } = await setup('rush', 2);
    const std = await createOrder(orgId, projectId, planSetId, 'FULL_PROJECT', 'STANDARD', 2);
    const rush = await createOrder(orgId, projectId, planSetId, 'FULL_PROJECT', 'RUSH', 2);
    const q1 = await quote(orgId, std.id);
    const q2 = await quote(orgId, rush.id);
    expect(q2.price_quote_minor!).toBeGreaterThan(q1.price_quote_minor!);
    expect(q2.promised_turnaround_hours!).toBeLessThan(q1.promised_turnaround_hours!);
  });

  it('only a DRAFT order can be quoted (re-quoting is rejected)', async () => {
    const { orgId, projectId, planSetId } = await setup('once', 0);
    const order = await createOrder(orgId, projectId, planSetId, 'SINGLE_TRADE', 'STANDARD', 1);
    await quote(orgId, order.id);
    await expect(quote(orgId, order.id)).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('rejects a quote when no rule exists for the tier/priority', async () => {
    await admin.db
      .delete(pricingRules)
      .where(and(eq(pricingRules.service_tier, 'SINGLE_TRADE'), eq(pricingRules.priority, 'RUSH')));
    const { orgId, projectId, planSetId } = await setup('missing', 0);
    const order = await createOrder(orgId, projectId, planSetId, 'SINGLE_TRADE', 'RUSH', 1);
    await expect(quote(orgId, order.id)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
