import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { CustomerRole, SsoProtocol } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';

/**
 * SSO connection (spec §13, P5-02) — an enterprise org's identity-provider configuration. A login is
 * routed to an org by its `email_domain` (globally unique among live connections), then the user is
 * JIT-provisioned with the EXPLICIT `default_role` (the caveat: never over-grant). `require_mfa`
 * enforces a second factor. JIT provisioning only happens once the domain is `domain_verified` — an
 * unverified domain claim can't pull users into an org. `org_id` is the RLS key.
 */
export const ssoConnections = pgTable(
  'sso_connections',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    protocol: text('protocol').$type<SsoProtocol>().notNull(),
    email_domain: text('email_domain').notNull(),
    issuer: text('issuer').notNull(),
    default_role: text('default_role').$type<CustomerRole>().notNull(),
    require_mfa: boolean('require_mfa').notNull().default(false),
    domain_verified: boolean('domain_verified').notNull().default(false),
    active: boolean('active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    // One live connection per email domain (a domain maps to exactly one org's IdP).
    uniqueIndex('sso_connections_domain_unique')
      .on(t.email_domain)
      .where(sql`${t.deleted_at} is null`),
  ],
);
