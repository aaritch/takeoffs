import { z } from 'zod';
import { CustomerRole, SsoProtocol } from '../enums/accounts';

/**
 * Enterprise SSO (spec §13, P5-02) — a customer org configures its own identity provider (SAML/OIDC)
 * and we map provider logins to memberships. The JIT default role is EXPLICIT (the caveat: never
 * over-grant on first SSO login), the email domain routes a login to the right org, and `requireMfa`
 * enforces a second factor.
 */
export const SsoConnectionView = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  protocol: SsoProtocol,
  emailDomain: z.string(),
  issuer: z.string(),
  /** The role a NEW user is JIT-provisioned with on first SSO login (explicit). */
  defaultRole: CustomerRole,
  requireMfa: z.boolean(),
  domainVerified: z.boolean(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});
export type SsoConnectionView = z.infer<typeof SsoConnectionView>;

/** POST /v1/sso/connections — configure the org's identity provider. */
export const CreateSsoConnectionRequest = z.object({
  protocol: SsoProtocol,
  emailDomain: z.string().min(3),
  issuer: z.string().min(1),
  defaultRole: CustomerRole,
  requireMfa: z.boolean().optional(),
  /** Provider config (SAML cert / SSO URL, or OIDC client/discovery) — opaque to us here. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateSsoConnectionRequest = z.infer<typeof CreateSsoConnectionRequest>;

export const SsoConnectionResponse = z.object({ connection: SsoConnectionView });
export type SsoConnectionResponse = z.infer<typeof SsoConnectionResponse>;

export const SsoConnectionsResponse = z.object({ connections: z.array(SsoConnectionView) });
export type SsoConnectionsResponse = z.infer<typeof SsoConnectionsResponse>;
