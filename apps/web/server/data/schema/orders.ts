import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { OrderPriority, OrderStatus, ServiceTier } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { projects } from './projects';
import { planSets } from './plan-sets';

/**
 * Order — a managed-service request (spec §5.5). A customer orders a completed takeoff; an
 * estimator fulfills it in the same editor and QA reviews it. The lifecycle (spec §11.2) is
 * enforced server-side by the orders state machine — the client never sets `status` directly.
 * Money is integer minor units. `org_id` is the RLS key (P0-07). `requested_trades` is the set of
 * trade-category ids in scope.
 */
export const orders = pgTable(
  'orders',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    plan_set_id: uuid('plan_set_id').references(() => planSets.id),
    requested_by_user_id: uuid('requested_by_user_id'),
    service_tier: text('service_tier').$type<ServiceTier>().notNull(),
    requested_trades: jsonb('requested_trades').$type<string[]>().notNull().default([]),
    scope_notes: text('scope_notes'),
    priority: text('priority').$type<OrderPriority>().notNull().default('STANDARD'),
    promised_turnaround_hours: integer('promised_turnaround_hours'),
    status: text('status').$type<OrderStatus>().notNull().default('DRAFT'),
    price_quote_minor: bigint('price_quote_minor', { mode: 'number' }),
    assigned_estimator_id: uuid('assigned_estimator_id'),
    qa_reviewer_id: uuid('qa_reviewer_id'),
    delivered_takeoff_id: uuid('delivered_takeoff_id'),
    placed_at: timestamp('placed_at', { withTimezone: true }),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('orders_org_idx').on(t.org_id), index('orders_project_idx').on(t.project_id)],
);

/**
 * OrderEvent — the immutable, append-only audit log of order lifecycle transitions (spec §5.5).
 * One row per transition (and the creation), recording from/to status, the actor + role, and a
 * JSON payload. Never updated or deleted. `org_id` is the RLS key.
 */
export const orderEvents = pgTable(
  'order_events',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    order_id: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    event_type: text('event_type').notNull(),
    from_status: text('from_status').$type<OrderStatus>(),
    to_status: text('to_status').$type<OrderStatus>().notNull(),
    actor_id: uuid('actor_id'),
    actor_role: text('actor_role'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_events_org_idx').on(t.org_id),
    index('order_events_order_idx').on(t.order_id),
  ],
);
