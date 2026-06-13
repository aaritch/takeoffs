// @takeoff/auth — authorization for the platform.
// The central (actor, action, resource) permission check, the customer role hierarchy, and
// the action→min-role table. Pure: no database, no environment access. Token verification
// and just-in-time user resolution land in P0-05.
export * from './roles';
export * from './permissions';
export * from './authorize';
