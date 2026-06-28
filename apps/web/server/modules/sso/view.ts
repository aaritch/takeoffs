import type { SsoConnectionView } from '@takeoff/contracts';
import type { SsoConnection } from './repository';

/** Connection view — `metadata` (which may hold certs/secrets) is intentionally NOT serialized. */
export function ssoConnectionToView(c: SsoConnection): SsoConnectionView {
  return {
    id: c.id,
    orgId: c.org_id,
    protocol: c.protocol,
    emailDomain: c.email_domain,
    issuer: c.issuer,
    defaultRole: c.default_role,
    requireMfa: c.require_mfa,
    domainVerified: c.domain_verified,
    active: c.active,
    createdAt: c.created_at.toISOString(),
  };
}
