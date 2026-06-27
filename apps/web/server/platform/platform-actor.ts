import type { ServiceRole } from '@takeoff/contracts';
import type { ServiceProfile } from '../modules/accounts/repository';
import { ApiError } from './http-error';

/**
 * The actor on a PLATFORM (service-staff) route (P3-04/05). Platform staff are NOT org members —
 * they act across customer orgs — so platform routes resolve a ServiceProfile instead of an org
 * membership. `serviceProfileId` is the fulfillment identity used for estimator isolation
 * (assigned_estimator_id) and payouts. Pure here (no Next.js / auth imports) so it's unit-testable.
 */
export interface PlatformActor {
  userId: string;
  serviceRole: ServiceRole;
  serviceProfileId: string;
}

/**
 * Authorization gate for a platform route: require an ACTIVE service profile and (optionally) one of
 * `roles`, else throw the right ApiError. Token claims are never trusted — the durable profile is
 * the source of the role, so revoking it revokes access on the next call.
 */
export function resolvePlatformActor(
  profile: ServiceProfile | undefined,
  roles?: ServiceRole[],
): PlatformActor {
  if (!profile || !profile.active) {
    throw new ApiError(403, 'FORBIDDEN', 'Platform staff access required.');
  }
  if (roles && !roles.includes(profile.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Insufficient platform role for this action.');
  }
  return { userId: profile.user_id, serviceRole: profile.role, serviceProfileId: profile.id };
}
