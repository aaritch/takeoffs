import type { CustomerRole } from '@takeoff/contracts';
import { isAtLeast } from './roles';

/**
 * Customer-side actions guarded by the permission check. Expressed as `resource:verb`.
 * Extended per phase; each maps to a minimum required role (the hierarchy does the rest).
 */
export type CustomerAction =
  | 'org:read'
  | 'report:export'
  | 'project:create'
  | 'project:update'
  | 'measurement:write'
  | 'takeoff:write'
  | 'project:delete'
  | 'members:manage'
  | 'billing:manage';

/**
 * Minimum role required for each action (spec §6.1):
 * - VIEWER can read and export, but cannot create or edit.
 * - ESTIMATOR_MEMBER can create/edit takeoffs, measurements, and projects.
 * - Only OWNER/ADMIN manage members or delete projects.
 * - Only OWNER touches billing.
 */
export const ACTION_MIN_ROLE: Readonly<Record<CustomerAction, CustomerRole>> = {
  'org:read': 'VIEWER',
  'report:export': 'VIEWER',
  'project:create': 'ESTIMATOR_MEMBER',
  'project:update': 'ESTIMATOR_MEMBER',
  'measurement:write': 'ESTIMATOR_MEMBER',
  'takeoff:write': 'ESTIMATOR_MEMBER',
  'project:delete': 'ADMIN',
  'members:manage': 'ADMIN',
  'billing:manage': 'OWNER',
};

/** All known customer actions. */
export const CUSTOMER_ACTIONS = Object.keys(ACTION_MIN_ROLE) as CustomerAction[];

/** Whether a role is permitted to perform an action, ignoring org membership (pure rank). */
export function hasCustomerCapability(role: CustomerRole, action: CustomerAction): boolean {
  return isAtLeast(role, ACTION_MIN_ROLE[action]);
}
