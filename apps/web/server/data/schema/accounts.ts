import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  CustomerRole,
  OrganizationStatus,
  PlanTier,
  ServiceRole,
  UserStatus,
} from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';

/**
 * Accounts & access tables (spec §5.1). Enum-valued columns are stored as `text` and typed
 * with `$type<...>()`; values are validated at the API boundary against the contracts Zod
 * enums (avoids painful pg-enum migrations as the value sets evolve).
 *
 * NOTE: `email` is stored already-lowercased (the service normalizes it) with a unique index,
 * in place of the spec's citext, to avoid requiring the citext extension.
 */
export const organizations = pgTable('organizations', {
  id: primaryId(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  billing_customer_ref: text('billing_customer_ref'),
  plan_tier: text('plan_tier').$type<PlanTier>().notNull().default('FREE'),
  seat_limit: integer('seat_limit').notNull().default(3),
  status: text('status').$type<OrganizationStatus>().notNull().default('ACTIVE'),
  created_by_user_id: uuid('created_by_user_id'),
  ...timestamps,
});

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    email: text('email').notNull(),
    full_name: text('full_name'),
    avatar_url: text('avatar_url'),
    auth_provider_subject: text('auth_provider_subject'),
    status: text('status').$type<UserStatus>().notNull().default('INVITED'),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').$type<CustomerRole>().notNull(),
    invited_by_user_id: uuid('invited_by_user_id'),
    /** NULL while an invitation is pending; set when accepted. */
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // Partial: one live membership per (org, user). A soft-deleted row does not block
    // re-inviting a previously removed member.
    uniqueIndex('memberships_org_user_unique')
      .on(t.org_id, t.user_id)
      .where(sql`${t.deleted_at} is null`),
    index('memberships_org_idx').on(t.org_id),
    index('memberships_user_idx').on(t.user_id),
  ],
);

export const serviceProfiles = pgTable('service_profiles', {
  id: primaryId(),
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  role: text('role').$type<ServiceRole>().notNull(),
  trade_specialties: text('trade_specialties')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  payout_account_ref: text('payout_account_ref'),
  active: boolean('active').notNull().default(true),
  current_capacity: integer('current_capacity').notNull().default(0),
  ...timestamps,
});
