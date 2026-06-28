import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WebhookEventType } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { accountsService } from '../accounts';
import {
  EVENT_ID_HEADER,
  SIGNATURE_HEADER,
  verifySignature,
  webhookService,
  type WebhookRequest,
  type WebhookSendResult,
} from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE webhook_deliveries, webhook_endpoints, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
});

async function org(slug: string): Promise<string> {
  const { organization } = await accountsService.createOrganizationWithOwner(admin.db, {
    name: slug,
    slug,
    owner: { email: `${slug}@t.test` },
  });
  return organization.id;
}

function endpoint(orgId: string, eventTypes: WebhookEventType[], url = 'https://hook.test/x') {
  return admin.db.transaction((tx) =>
    webhookService.createEndpoint(tx, { orgId, url, eventTypes }),
  );
}

/** A sender that returns a scripted sequence of results and records every request it was given. */
function scriptedSender(...results: WebhookSendResult[]) {
  const sent: WebhookRequest[] = [];
  let i = 0;
  return {
    sent,
    sender: {
      async send(req: WebhookRequest): Promise<WebhookSendResult> {
        sent.push(req);
        return results[Math.min(i++, results.length - 1)]!;
      },
    },
  };
}

const T0 = new Date('2026-06-28T00:00:00Z');
const T1 = new Date('2026-06-28T01:00:00Z'); // well past any backoff

describe('outbound webhooks (P5-03)', () => {
  it('delivers a subscribed event, signed, and retries on transient failure', async () => {
    const orgId = await org('deliver');
    const { secret, endpoint: ep } = await endpoint(orgId, ['ORDER_DELIVERED']);
    const eventId = uuidv7();
    const [delivery] = await webhookService.emit(admin.db, {
      orgId,
      eventType: 'ORDER_DELIVERED',
      eventId,
      data: { orderId: 'o-1', status: 'DELIVERED' },
    });
    expect(delivery!.status).toBe('PENDING');

    // First attempt fails transiently (503) → scheduled for retry, not failed.
    const s = scriptedSender({ ok: false, statusCode: 503 }, { ok: true, statusCode: 200 });
    const afterFirst = await webhookService.attemptDelivery(admin.db, delivery!.id, {
      sender: s.sender,
      now: T0,
    });
    expect(afterFirst).toMatchObject({
      status: 'PENDING',
      attempt_count: 1,
      last_status_code: 503,
    });
    expect(afterFirst.next_attempt_at).not.toBeNull();

    // Second attempt (past the backoff) succeeds → DELIVERED.
    const afterSecond = await webhookService.attemptDelivery(admin.db, delivery!.id, {
      sender: s.sender,
      now: T1,
    });
    expect(afterSecond).toMatchObject({ status: 'DELIVERED', attempt_count: 2 });
    expect(afterSecond.delivered_at).not.toBeNull();

    // Both attempts were signed with the endpoint secret (a consumer can verify authenticity).
    expect(s.sent).toHaveLength(2);
    expect(
      verifySignature(secret, s.sent[0]!.headers[SIGNATURE_HEADER]!, s.sent[0]!.body, {
        nowSec: T0.getTime() / 1000,
      }),
    ).toBe(true);
    expect(ep.url).toBe('https://hook.test/x');
  });

  it('a retry carries the same idempotency key, so a consumer can detect a duplicate', async () => {
    const orgId = await org('idem');
    await endpoint(orgId, ['ORDER_DELIVERED']);
    const eventId = uuidv7();
    const [delivery] = await webhookService.emit(admin.db, {
      orgId,
      eventType: 'ORDER_DELIVERED',
      eventId,
      data: { orderId: 'o-2' },
    });

    const s = scriptedSender({ ok: false, statusCode: 500 }, { ok: true, statusCode: 200 });
    await webhookService.attemptDelivery(admin.db, delivery!.id, { sender: s.sender, now: T0 });
    await webhookService.attemptDelivery(admin.db, delivery!.id, { sender: s.sender, now: T1 });

    expect(s.sent[0]!.headers[EVENT_ID_HEADER]).toBe(eventId);
    expect(s.sent[1]!.headers[EVENT_ID_HEADER]).toBe(eventId); // identical across the retry
  });

  it('a permanent 4xx fails immediately without retrying', async () => {
    const orgId = await org('perm');
    await endpoint(orgId, ['ORDER_DELIVERED']);
    const [d] = await webhookService.emit(admin.db, {
      orgId,
      eventType: 'ORDER_DELIVERED',
      eventId: uuidv7(),
      data: {},
    });
    const s = scriptedSender({ ok: false, statusCode: 400 });
    const result = await webhookService.attemptDelivery(admin.db, d!.id, {
      sender: s.sender,
      now: T0,
    });
    expect(result).toMatchObject({ status: 'FAILED', attempt_count: 1, last_status_code: 400 });
    expect(result.next_attempt_at).toBeNull();
  });

  it('only fans out to active endpoints subscribed to the event', async () => {
    const orgId = await org('fan');
    await endpoint(orgId, ['ORDER_DELIVERED']); // subscribed
    await endpoint(orgId, ['TAKEOFF_COMPLETED']); // different event → no delivery
    const inactive = await endpoint(orgId, ['ORDER_DELIVERED']);
    await admin.db.transaction((tx) => webhookService.deleteEndpoint(tx, inactive.endpoint.id));

    const deliveries = await webhookService.emit(admin.db, {
      orgId,
      eventType: 'ORDER_DELIVERED',
      eventId: uuidv7(),
      data: { orderId: 'o-3' },
    });
    expect(deliveries).toHaveLength(1); // only the active, subscribed endpoint
  });

  it('emit is idempotent and the payload carries only the data given', async () => {
    const orgId = await org('payload');
    await endpoint(orgId, ['ORDER_DELIVERED']);
    const eventId = uuidv7();
    const data = { orderId: 'o-4', status: 'DELIVERED' };

    const first = await webhookService.emit(admin.db, {
      orgId,
      eventType: 'ORDER_DELIVERED',
      eventId,
      data,
    });
    const again = await webhookService.emit(admin.db, {
      orgId,
      eventType: 'ORDER_DELIVERED',
      eventId,
      data,
    });
    expect(again[0]!.id).toBe(first[0]!.id); // same delivery, not a duplicate

    // The payload is exactly {id, type, data} — no secret/internal fields leak past the boundary.
    expect(first[0]!.payload).toEqual({ id: eventId, type: 'ORDER_DELIVERED', data });
  });
});
