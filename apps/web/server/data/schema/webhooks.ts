import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { WebhookDeliveryStatus, WebhookEventType } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';

/**
 * Webhook endpoint (spec §8, P5-03) — a customer org's subscription: a URL + a per-endpoint signing
 * `secret` and the set of event types it wants. `org_id` is the RLS key. The secret signs every
 * delivery (HMAC) so the receiver can verify authenticity — it never leaves with the payload.
 */
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: primaryId(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  event_types: text('event_types').$type<WebhookEventType>().array().notNull(),
  active: boolean('active').notNull().default(true),
  description: text('description'),
  ...timestamps,
});

/**
 * Webhook delivery (P5-03) — one event to one endpoint, delivered with retries. `event_id` is the
 * IDEMPOTENCY KEY sent to the consumer (stable across retries, so a duplicate is detectable); the
 * unique (endpoint_id, event_id) also makes emit idempotent on our side. `next_attempt_at` schedules
 * the retry sweep. `payload` carries only non-sensitive fields. `org_id` is the RLS key.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    endpoint_id: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id),
    event_type: text('event_type').$type<WebhookEventType>().notNull(),
    event_id: uuid('event_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').$type<WebhookDeliveryStatus>().notNull().default('PENDING'),
    attempt_count: integer('attempt_count').notNull().default(0),
    max_attempts: integer('max_attempts').notNull().default(5),
    last_status_code: integer('last_status_code'),
    last_error: text('last_error'),
    next_attempt_at: timestamp('next_attempt_at', { withTimezone: true }),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('webhook_deliveries_endpoint_event_unique').on(t.endpoint_id, t.event_id)],
);
