import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { can } from '@takeoff/auth';
import { createDb, type DbHandle } from '../../data/client';
import { resolveAuthContext } from './auth-context';
import { accountsService } from './service';

// Integration tests run against the LOCAL docker Postgres (pnpm dev:up). They exercise real
// SQL — including the rules where correctness matters most (seats, last-owner, access revoke).
const url = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let handle: DbHandle;
const db = () => handle.db;

beforeAll(async () => {
  handle = createDb(url);
  await migrate(handle.db, { migrationsFolder });
});

beforeEach(async () => {
  await handle.db.execute(
    sql`TRUNCATE memberships, service_profiles, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await handle.pool.end();
});

async function seedOrg(opts: { seatLimit?: number } = {}) {
  return accountsService.createOrganizationWithOwner(db(), {
    name: 'Acme Builders',
    slug: 'acme',
    owner: { email: 'owner@acme.test', fullName: 'Olive Owner' },
    ...(opts.seatLimit !== undefined ? { seatLimit: opts.seatLimit } : {}),
  });
}

describe('createOrganizationWithOwner', () => {
  it('creates an org with an active OWNER who can manage members', async () => {
    const { organization, owner, membership } = await seedOrg();
    expect(organization.slug).toBe('acme');
    expect(membership.role).toBe('OWNER');
    expect(membership.accepted_at).not.toBeNull();

    const ctx = await resolveAuthContext(db(), owner.id);
    expect(can(ctx, 'members:manage', { orgId: organization.id })).toBe(true);
    expect(can(ctx, 'billing:manage', { orgId: organization.id })).toBe(true);
  });
});

describe('invite + accept', () => {
  it('invites a member (pending) and activates them on acceptance', async () => {
    const { organization, owner } = await seedOrg();
    const invited = await accountsService.inviteMember(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'em@acme.test',
      role: 'ESTIMATOR_MEMBER',
    });
    expect(invited.accepted_at).toBeNull();

    // Pending member has no access yet.
    const before = await resolveAuthContext(db(), invited.user_id);
    expect(can(before, 'org:read', { orgId: organization.id })).toBe(false);

    await accountsService.acceptInvitation(db(), {
      orgId: organization.id,
      userId: invited.user_id,
    });
    const after = await resolveAuthContext(db(), invited.user_id);
    expect(can(after, 'org:read', { orgId: organization.id })).toBe(true);
    expect(can(after, 'measurement:write', { orgId: organization.id })).toBe(true);
  });

  it('rejects inviting someone who is already a member or invited', async () => {
    const { organization, owner } = await seedOrg();
    const args = {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'dup@acme.test',
      role: 'VIEWER' as const,
    };
    await accountsService.inviteMember(db(), args);
    await expect(accountsService.inviteMember(db(), args)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('only OWNER/ADMIN may invite — a VIEWER is forbidden', async () => {
    const { organization, owner } = await seedOrg();
    const viewer = await accountsService.inviteMember(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'view@acme.test',
      role: 'VIEWER',
    });
    await accountsService.acceptInvitation(db(), {
      orgId: organization.id,
      userId: viewer.user_id,
    });

    await expect(
      accountsService.inviteMember(db(), {
        orgId: organization.id,
        actorUserId: viewer.user_id,
        email: 'next@acme.test',
        role: 'VIEWER',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('seat limits (enforced at acceptance)', () => {
  it('blocks an acceptance that would exceed the seat limit', async () => {
    const { organization, owner } = await seedOrg({ seatLimit: 1 }); // owner fills the only seat
    const invited = await accountsService.inviteMember(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'overflow@acme.test',
      role: 'ESTIMATOR_MEMBER',
    });

    await expect(
      accountsService.acceptInvitation(db(), {
        orgId: organization.id,
        userId: invited.user_id,
      }),
    ).rejects.toMatchObject({ code: 'SEAT_LIMIT_EXCEEDED' });
  });
});

describe('VIEWER capability (read/export, not write)', () => {
  it('allows read and export but denies create/edit', async () => {
    const { organization, owner } = await seedOrg();
    const viewer = await accountsService.inviteMember(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'ro@acme.test',
      role: 'VIEWER',
    });
    await accountsService.acceptInvitation(db(), {
      orgId: organization.id,
      userId: viewer.user_id,
    });

    const ctx = await resolveAuthContext(db(), viewer.user_id);
    expect(can(ctx, 'org:read', { orgId: organization.id })).toBe(true);
    expect(can(ctx, 'report:export', { orgId: organization.id })).toBe(true);
    expect(can(ctx, 'measurement:write', { orgId: organization.id })).toBe(false);
    expect(can(ctx, 'project:create', { orgId: organization.id })).toBe(false);
  });
});

describe('removal revokes access on the next request', () => {
  it('a removed member can no longer act in the org', async () => {
    const { organization, owner } = await seedOrg();
    const member = await accountsService.inviteMember(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'gone@acme.test',
      role: 'ESTIMATOR_MEMBER',
    });
    await accountsService.acceptInvitation(db(), {
      orgId: organization.id,
      userId: member.user_id,
    });

    const before = await resolveAuthContext(db(), member.user_id);
    expect(can(before, 'measurement:write', { orgId: organization.id })).toBe(true);

    await accountsService.removeMember(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      targetUserId: member.user_id,
    });

    const after = await resolveAuthContext(db(), member.user_id);
    expect(can(after, 'org:read', { orgId: organization.id })).toBe(false);
  });
});

describe('last-owner protection', () => {
  it('cannot remove or demote the last owner', async () => {
    const { organization, owner } = await seedOrg();

    await expect(
      accountsService.removeMember(db(), {
        orgId: organization.id,
        actorUserId: owner.id,
        targetUserId: owner.id,
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });

    await expect(
      accountsService.assignRole(db(), {
        orgId: organization.id,
        actorUserId: owner.id,
        targetUserId: owner.id,
        newRole: 'VIEWER',
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });
  });

  it('allows demoting an owner once a second owner exists', async () => {
    const { organization, owner } = await seedOrg();
    const second = await accountsService.inviteMember(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'owner2@acme.test',
      role: 'OWNER',
    });
    await accountsService.acceptInvitation(db(), {
      orgId: organization.id,
      userId: second.user_id,
    });

    const demoted = await accountsService.assignRole(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      targetUserId: second.user_id,
      newRole: 'ADMIN',
    });
    expect(demoted.role).toBe('ADMIN');
  });
});

describe('provisionFromIdentity (JIT login)', () => {
  it('creates an active user, normalizes email, records the subject, and is idempotent', async () => {
    const first = await accountsService.provisionFromIdentity(db(), {
      email: 'New.User@acme.test',
      fullName: 'New User',
      subject: 'oidc|123',
    });
    expect(first.status).toBe('ACTIVE');
    expect(first.email).toBe('new.user@acme.test');
    expect(first.auth_provider_subject).toBe('oidc|123');
    expect(first.last_seen_at).not.toBeNull();

    const again = await accountsService.provisionFromIdentity(db(), {
      email: 'new.user@acme.test',
      subject: 'oidc|123',
    });
    expect(again.id).toBe(first.id);
  });
});

describe('training-data opt-out (P4-05)', () => {
  it('defaults to opted-in and lets an OWNER opt out and back in', async () => {
    const { organization, owner } = await seedOrg();
    expect(await accountsService.getTrainingOptOut(db(), organization.id)).toBe(false);

    const out = await accountsService.setTrainingOptOut(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      optOut: true,
    });
    expect(out).toBe(true);
    expect(await accountsService.getTrainingOptOut(db(), organization.id)).toBe(true);

    await accountsService.setTrainingOptOut(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      optOut: false,
    });
    expect(await accountsService.getTrainingOptOut(db(), organization.id)).toBe(false);
  });

  it('forbids a non-owner (VIEWER) from changing the setting', async () => {
    const { organization, owner } = await seedOrg();
    const viewer = await accountsService.inviteMember(db(), {
      orgId: organization.id,
      actorUserId: owner.id,
      email: 'view@acme.test',
      role: 'VIEWER',
    });
    await accountsService.acceptInvitation(db(), {
      orgId: organization.id,
      userId: viewer.user_id,
    });

    await expect(
      accountsService.setTrainingOptOut(db(), {
        orgId: organization.id,
        actorUserId: viewer.user_id,
        optOut: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // The flag is untouched by the rejected attempt.
    expect(await accountsService.getTrainingOptOut(db(), organization.id)).toBe(false);
  });

  it('lists exactly the opted-out org ids for the offline export', async () => {
    const a = await seedOrg();
    const b = await accountsService.createOrganizationWithOwner(db(), {
      name: 'Beta Builders',
      slug: 'beta',
      owner: { email: 'owner@beta.test', fullName: 'Bo Owner' },
    });
    await accountsService.setTrainingOptOut(db(), {
      orgId: b.organization.id,
      actorUserId: b.owner.id,
      optOut: true,
    });

    const optedOut = await accountsService.listOptedOutOrgIds(db());
    expect(optedOut).toEqual([b.organization.id]);
    expect(optedOut).not.toContain(a.organization.id);
  });
});
