import { fileURLToPath } from 'node:url';
import { isNull, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MeasurementGeometry } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { conditions, takeoffs, tradeCategories } from '../../data/schema';
import { projects } from '../../data/schema';
import { accountsService } from '../accounts';
import { measurementsService } from '../measurements';
import { seedGlobalTradeData } from '../trades/seed';
import { collaborationService } from './service';
import { activeParticipants, emptyPresence, join, leave, update } from './presence';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const appUrl =
  process.env.APP_DATABASE_URL ?? 'postgres://takeoff_app:takeoff_app@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;
let app: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  app = createDb(appUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE comments, measurements, quantity_rollups, conditions, takeoffs, projects, condition_templates, trade_categories, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
  await seedGlobalTradeData(admin.db);
});

afterAll(async () => {
  await admin.pool.end();
  await app.pool.end();
});

const line = (length: number): MeasurementGeometry => ({
  type: 'POLYLINE',
  points: [
    { x: 0, y: 0 },
    { x: length, y: 0 },
  ],
});

/** An org + takeoff with one LINEAR condition and one measurement on it. */
async function setup() {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: 'collab',
      slug: 'collab',
      owner: { email: 'collab@t.test' },
    })
  ).organization.id;
  const tradeId = (await admin.db.query.tradeCategories.findFirst({
    where: isNull(tradeCategories.org_id),
  }))!.id;

  return withOrgScope(app.db, orgId, async (tx) => {
    const [project] = await tx.insert(projects).values({ org_id: orgId, name: 'Bid' }).returning();
    const [takeoff] = await tx
      .insert(takeoffs)
      .values({ org_id: orgId, project_id: project!.id, origin: 'SELF_SERVE' })
      .returning();
    const [condition] = await tx
      .insert(conditions)
      .values({
        org_id: orgId,
        takeoff_id: takeoff!.id,
        trade_category_id: tradeId,
        name: 'Wall',
        measurement_type: 'LINEAR',
        unit: 'LF',
      })
      .returning();
    const { measurement } = await measurementsService.create(tx, {
      condition_id: condition!.id,
      geometry: line(10),
      unit_per_pixel: 1,
    });
    return { orgId, takeoffId: takeoff!.id, measurementId: measurement.id };
  });
}

describe('presence (pure, P5-04)', () => {
  it('two users in a takeoff see each other, with live selection updates', () => {
    const a = uuidv7();
    const b = uuidv7();
    let s = emptyPresence();
    s = join(s, a, { displayName: 'Ana', nowMs: 1000 });
    s = join(s, b, { displayName: 'Bo', nowMs: 1000 });
    s = update(s, a, { selection: ['m1'] }, 1100); // Ana selects a measurement (an editing cue)

    const active = activeParticipants(s, 1200, 30_000);
    expect(active.map((p) => p.userId).sort()).toEqual([a, b].sort());
    expect(active.find((p) => p.userId === a)?.selection).toEqual(['m1']);
  });

  it('drops a participant whose heartbeat went stale, and on explicit leave', () => {
    const a = uuidv7();
    const b = uuidv7();
    let s = join(join(emptyPresence(), a, { nowMs: 0 }), b, { nowMs: 0 });
    s = update(s, a, {}, 50_000); // Ana keeps heartbeating; Bo goes quiet

    expect(activeParticipants(s, 50_000, 30_000).map((p) => p.userId)).toEqual([a]); // Bo stale
    expect(activeParticipants(leave(s, a), 50_000, 30_000)).toHaveLength(0); // Ana left
  });
});

describe('comments anchored to measurements (P5-04)', () => {
  it('anchors a comment to a measurement and it survives a geometry edit', async () => {
    const { orgId, takeoffId, measurementId } = await setup();

    const comment = await withOrgScope(app.db, orgId, (tx) =>
      collaborationService.createComment(tx, {
        takeoffId,
        authorUserId: uuidv7(),
        body: 'Should this run to the corner?',
        measurementId,
      }),
    );
    expect(comment.measurement_id).toBe(measurementId);

    // Editing the measurement's geometry keeps its id, so the anchor holds.
    await withOrgScope(app.db, orgId, (tx) =>
      measurementsService.updateGeometry(tx, measurementId, line(25), 1),
    );

    const anchored = await withOrgScope(app.db, orgId, (tx) =>
      collaborationService.listForMeasurement(tx, measurementId),
    );
    expect(anchored).toHaveLength(1);
    expect(anchored[0]!.id).toBe(comment.id);
    expect(anchored[0]!.measurement_id).toBe(measurementId); // still anchored after the edit
  });

  it('threads, resolves/reopens, and rejects an anchor that does not exist', async () => {
    const { orgId, takeoffId, measurementId } = await setup();
    const author = uuidv7();

    const root = await withOrgScope(app.db, orgId, (tx) =>
      collaborationService.createComment(tx, {
        takeoffId,
        authorUserId: author,
        body: 'root',
        measurementId,
      }),
    );
    const reply = await withOrgScope(app.db, orgId, (tx) =>
      collaborationService.createComment(tx, {
        takeoffId,
        authorUserId: author,
        body: 'reply',
        parentCommentId: root.id,
      }),
    );
    expect(reply.parent_comment_id).toBe(root.id);

    const resolver = uuidv7();
    const resolved = await withOrgScope(app.db, orgId, (tx) =>
      collaborationService.resolveComment(tx, root.id, resolver),
    );
    expect(resolved).toMatchObject({ resolved: true, resolved_by_user_id: resolver });
    const reopened = await withOrgScope(app.db, orgId, (tx) =>
      collaborationService.reopenComment(tx, root.id),
    );
    expect(reopened).toMatchObject({ resolved: false, resolved_by_user_id: null });

    await expect(
      withOrgScope(app.db, orgId, (tx) =>
        collaborationService.createComment(tx, {
          takeoffId,
          authorUserId: author,
          body: 'bad anchor',
          measurementId: uuidv7(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('the reconnect snapshot returns the authoritative comment state', async () => {
    const { orgId, takeoffId, measurementId } = await setup();
    await withOrgScope(app.db, orgId, (tx) =>
      collaborationService.createComment(tx, {
        takeoffId,
        authorUserId: uuidv7(),
        body: 'note',
        measurementId,
      }),
    );

    const snapshot = await withOrgScope(app.db, orgId, (tx) =>
      collaborationService.snapshot(tx, takeoffId),
    );
    expect(snapshot.comments).toHaveLength(1);
    expect(snapshot.comments[0]!.body).toBe('note');
  });
});
