import type { AuthContext } from '@takeoff/auth';
import type { CustomerRole } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { repo } from './repository';

/**
 * Build the {@link AuthContext} for a user from durable records — active memberships and an
 * active service profile. This is the ONLY source of an actor's roles; token claims are never
 * trusted (spec §13.2). Removing/soft-deleting a membership therefore revokes access on the
 * very next call, because the membership no longer appears here.
 *
 * (P0-05 will resolve the userId from a verified identity-provider token before calling this.)
 */
export async function resolveAuthContext(db: DB, userId: string): Promise<AuthContext> {
  const active = await repo.listActiveMembershipsForUser(db, userId);
  const membershipsByOrg = new Map<string, CustomerRole>(active.map((m) => [m.org_id, m.role]));

  const service = await repo.getServiceProfileByUser(db, userId);
  return {
    userId,
    membershipsByOrg,
    ...(service && service.active ? { serviceRole: service.role } : {}),
  };
}
