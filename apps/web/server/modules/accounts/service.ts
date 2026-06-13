import { can } from '@takeoff/auth';
import type { CustomerAction } from '@takeoff/auth';
import type { CustomerRole, PlanTier } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { resolveAuthContext } from './auth-context';
import { Conflict, Forbidden, LastOwner, NotFound, SeatLimitExceeded } from './errors';
import { repo, type Membership, type Organization, type User } from './repository';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Resolve the actor and require a capability in the org, else throw Forbidden. */
async function requireCapability(
  db: DB,
  actorUserId: string,
  orgId: string,
  action: CustomerAction,
): Promise<void> {
  const ctx = await resolveAuthContext(db, actorUserId);
  if (!can(ctx, action, { orgId })) {
    throw Forbidden(`Not permitted to ${action}`);
  }
}

/** Find a user by (normalized) email, or create one with the given status. */
async function findOrCreateUser(
  db: DB,
  email: string,
  status: User['status'],
  extra: { full_name?: string; auth_provider_subject?: string } = {},
): Promise<User> {
  const normalized = normalizeEmail(email);
  const existing = await repo.getUserByEmail(db, normalized);
  if (existing) return existing;
  return repo.insertUser(db, { email: normalized, status, ...extra });
}

export interface CreateOrgInput {
  name: string;
  slug: string;
  owner: { email: string; fullName?: string; authProviderSubject?: string };
  planTier?: PlanTier;
  seatLimit?: number;
}

export interface CreateOrgResult {
  organization: Organization;
  owner: User;
  membership: Membership;
}

export const accountsService = {
  /** Create an organization and its first OWNER (the creator), accepted immediately. */
  async createOrganizationWithOwner(db: DB, input: CreateOrgInput): Promise<CreateOrgResult> {
    const owner = await findOrCreateUser(db, input.owner.email, 'ACTIVE', {
      ...(input.owner.fullName ? { full_name: input.owner.fullName } : {}),
      ...(input.owner.authProviderSubject
        ? { auth_provider_subject: input.owner.authProviderSubject }
        : {}),
    });
    // Ensure the creator is ACTIVE even if they pre-existed as INVITED.
    if (owner.status !== 'ACTIVE') {
      await repo.setUserStatus(db, owner.id, 'ACTIVE');
    }

    const organization = await repo.insertOrganization(db, {
      name: input.name,
      slug: input.slug,
      created_by_user_id: owner.id,
      ...(input.planTier ? { plan_tier: input.planTier } : {}),
      ...(input.seatLimit !== undefined ? { seat_limit: input.seatLimit } : {}),
    });

    const membership = await repo.insertMembership(db, {
      org_id: organization.id,
      user_id: owner.id,
      role: 'OWNER',
      accepted_at: new Date(),
    });

    return { organization, owner, membership };
  },

  /**
   * Invite a member. Requires `members:manage`. Creates the user (INVITED) if new. Seat limits
   * are NOT enforced here — they are enforced at acceptance (spec §6.1).
   */
  async inviteMember(
    db: DB,
    input: { orgId: string; actorUserId: string; email: string; role: CustomerRole },
  ): Promise<Membership> {
    await requireCapability(db, input.actorUserId, input.orgId, 'members:manage');

    const user = await findOrCreateUser(db, input.email, 'INVITED');
    const existing = await repo.getMembership(db, input.orgId, user.id);
    if (existing) {
      throw Conflict('User is already a member of or invited to this organization');
    }

    return repo.insertMembership(db, {
      org_id: input.orgId,
      user_id: user.id,
      role: input.role,
      invited_by_user_id: input.actorUserId,
      // accepted_at stays NULL — pending until accepted.
    });
  },

  /**
   * Accept a pending invitation. Enforces the org's seat limit at this point: if accepting
   * would exceed `seat_limit`, the acceptance is blocked with an upgrade prompt.
   */
  async acceptInvitation(db: DB, input: { orgId: string; userId: string }): Promise<Membership> {
    const membership = await repo.getMembership(db, input.orgId, input.userId);
    if (!membership) throw NotFound('No invitation found');
    if (membership.accepted_at) return membership; // already accepted — idempotent

    const org = await repo.getOrganization(db, input.orgId);
    if (!org) throw NotFound('Organization not found');

    const activeCount = await repo.countActiveMembers(db, input.orgId);
    if (activeCount >= org.seat_limit) {
      throw SeatLimitExceeded(
        `This organization has reached its seat limit of ${org.seat_limit}. Upgrade the plan to add more members.`,
      );
    }

    const accepted = await repo.acceptMembership(db, membership.id);
    await repo.setUserStatus(db, input.userId, 'ACTIVE');
    return accepted;
  },

  /**
   * Change a member's role. Requires `members:manage`. The last remaining OWNER cannot be
   * demoted without promoting another first.
   */
  async assignRole(
    db: DB,
    input: { orgId: string; actorUserId: string; targetUserId: string; newRole: CustomerRole },
  ): Promise<Membership> {
    await requireCapability(db, input.actorUserId, input.orgId, 'members:manage');

    const membership = await repo.getActiveMembership(db, input.orgId, input.targetUserId);
    if (!membership) throw NotFound('Member not found');
    if (membership.role === input.newRole) return membership;

    if (membership.role === 'OWNER' && input.newRole !== 'OWNER') {
      const owners = await repo.countActiveOwners(db, input.orgId);
      if (owners <= 1) {
        throw LastOwner('Cannot demote the last owner; promote another owner first');
      }
    }

    return repo.updateMembershipRole(db, membership.id, input.newRole);
  },

  /**
   * Remove a member (soft-delete). Requires `members:manage`. The last remaining OWNER cannot
   * be removed. Access is revoked on the member's next request.
   */
  async removeMember(
    db: DB,
    input: { orgId: string; actorUserId: string; targetUserId: string },
  ): Promise<void> {
    await requireCapability(db, input.actorUserId, input.orgId, 'members:manage');

    const membership = await repo.getMembership(db, input.orgId, input.targetUserId);
    if (!membership) throw NotFound('Member not found');

    if (membership.role === 'OWNER' && membership.accepted_at) {
      const owners = await repo.countActiveOwners(db, input.orgId);
      if (owners <= 1) {
        throw LastOwner('Cannot remove the last owner; promote another owner first');
      }
    }

    await repo.softDeleteMembership(db, membership.id);
  },
};
