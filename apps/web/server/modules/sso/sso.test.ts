import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CustomerRole } from '@takeoff/contracts';
import { createDb, type DbHandle } from '../../data/client';
import { accountsService } from '../accounts';
import { assertMfa, emailDomain, ssoService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE sso_connections, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
});

/** An org (owned by `boss@<domain>`) with a verified SSO connection for `domain`. */
async function orgWithSso(
  slug: string,
  domain: string,
  opts: {
    defaultRole?: CustomerRole;
    requireMfa?: boolean;
    issuer?: string;
    verified?: boolean;
  } = {},
): Promise<{ orgId: string; issuer: string; connectionId: string }> {
  const orgId = (
    await accountsService.createOrganizationWithOwner(admin.db, {
      name: slug,
      slug,
      owner: { email: `boss@${domain}` },
    })
  ).organization.id;
  const issuer = opts.issuer ?? `https://idp.${domain}`;
  const connection = await admin.db.transaction((tx) =>
    ssoService.createConnection(tx, {
      orgId,
      protocol: 'OIDC',
      emailDomain: domain,
      issuer,
      defaultRole: opts.defaultRole ?? 'ESTIMATOR_MEMBER',
      requireMfa: opts.requireMfa ?? false,
    }),
  );
  if (opts.verified ?? true) {
    await admin.db.transaction((tx) => ssoService.verifyDomain(tx, connection.id));
  }
  return { orgId, issuer, connectionId: connection.id };
}

describe('SSO & MFA — pure (P5-02)', () => {
  it('emailDomain extracts the lowercased domain', () => {
    expect(emailDomain('Jane.Doe@Acme.COM')).toBe('acme.com');
    expect(emailDomain('nope')).toBe('');
  });

  it('assertMfa blocks only when MFA is required and not satisfied', () => {
    expect(() => assertMfa(true, true)).not.toThrow();
    expect(() => assertMfa(false, false)).not.toThrow();
    expect(() => assertMfa(true, false)).toThrow(/multi-factor/);
  });
});

describe('SSO & MFA — provisioning (P5-02)', () => {
  it('an enterprise user lands in the correct org with the connection default role', async () => {
    const { orgId, issuer } = await orgWithSso('acme', 'acme.com', {
      defaultRole: 'ESTIMATOR_MEMBER',
    });

    const login = await ssoService.provisionEnterpriseLogin(admin.db, {
      email: 'jane@acme.com',
      subject: 'idp|jane',
      issuer,
      mfaSatisfied: true,
    });

    expect(login.organization.id).toBe(orgId);
    expect(login.role).toBe('ESTIMATOR_MEMBER'); // the explicit JIT default — not over-granted
    expect(login.membership.accepted_at).not.toBeNull();
  });

  it('MFA enforcement blocks a login that did not satisfy the second factor', async () => {
    const { issuer } = await orgWithSso('mfaorg', 'mfa.com', { requireMfa: true });

    await expect(
      ssoService.provisionEnterpriseLogin(admin.db, {
        email: 'sam@mfa.com',
        issuer,
        mfaSatisfied: false,
      }),
    ).rejects.toMatchObject({ code: 'MFA_REQUIRED' });
  });

  it('an existing member keeps their role — SSO never silently changes access', async () => {
    const { orgId, issuer } = await orgWithSso('keep', 'keep.com', { defaultRole: 'VIEWER' });

    // boss@keep.com is already the OWNER (created with the org).
    const login = await ssoService.provisionEnterpriseLogin(admin.db, {
      email: 'boss@keep.com',
      issuer,
      mfaSatisfied: true,
    });
    expect(login.organization.id).toBe(orgId);
    expect(login.role).toBe('OWNER'); // not downgraded to the VIEWER default
  });

  it('is idempotent — a second login does not duplicate the membership', async () => {
    const { issuer } = await orgWithSso('idem', 'idem.com');
    const first = await ssoService.provisionEnterpriseLogin(admin.db, {
      email: 'rep@idem.com',
      issuer,
      mfaSatisfied: true,
    });
    const second = await ssoService.provisionEnterpriseLogin(admin.db, {
      email: 'rep@idem.com',
      issuer,
      mfaSatisfied: true,
    });
    expect(second.membership.id).toBe(first.membership.id);
  });

  it('rejects an unknown domain, an unverified domain, and a wrong issuer', async () => {
    await expect(
      ssoService.provisionEnterpriseLogin(admin.db, { email: 'x@nowhere.com', mfaSatisfied: true }),
    ).rejects.toMatchObject({ code: 'NO_CONNECTION' });

    await orgWithSso('unverified', 'pending.com', { verified: false });
    await expect(
      ssoService.provisionEnterpriseLogin(admin.db, { email: 'x@pending.com', mfaSatisfied: true }),
    ).rejects.toMatchObject({ code: 'DOMAIN_UNVERIFIED' });

    await orgWithSso('issuerorg', 'issuer.com', { issuer: 'https://real.idp' });
    await expect(
      ssoService.provisionEnterpriseLogin(admin.db, {
        email: 'x@issuer.com',
        issuer: 'https://evil.idp',
        mfaSatisfied: true,
      }),
    ).rejects.toMatchObject({ code: 'ISSUER_MISMATCH' });
  });

  it('a domain maps to exactly one org (unique routing)', async () => {
    await orgWithSso('first', 'dup.com');
    const second = (
      await accountsService.createOrganizationWithOwner(admin.db, {
        name: 'second',
        slug: 'second',
        owner: { email: 'owner@second.test' },
      })
    ).organization.id;
    await expect(
      admin.db.transaction((tx) =>
        ssoService.createConnection(tx, {
          orgId: second,
          protocol: 'SAML',
          emailDomain: 'dup.com',
          issuer: 'https://idp.second',
          defaultRole: 'VIEWER',
        }),
      ),
    ).rejects.toThrow(); // unique-domain constraint
  });
});
