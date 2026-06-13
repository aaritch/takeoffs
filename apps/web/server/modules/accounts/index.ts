// Accounts module — organizations, users, memberships, service profiles, and the rules over
// them (org creation, invitations, seat limits, role assignment, removal, last-owner). The
// permission check itself lives in @takeoff/auth; this module builds the AuthContext from the
// database and enforces the account-level rules.
export { accountsService } from './service';
export type { CreateOrgInput, CreateOrgResult } from './service';
export { resolveAuthContext } from './auth-context';
export { AccountsError } from './errors';
export type { AccountsErrorCode } from './errors';
export type { Organization, User, Membership, ServiceProfile } from './repository';
