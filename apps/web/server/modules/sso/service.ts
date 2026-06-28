import type { CustomerRole, SsoProtocol } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import type { OrgScopedTx } from '../../data/org-scope';
import { accountsService } from '../accounts';
import { repo as accountsRepo } from '../accounts/repository';
import type { Membership, Organization, User } from '../accounts/repository';
import { SsoError } from './errors';
import { ssoConnectionsRepo, type SsoConnection } from './repository';

/** The email domain (lowercased) a login routes by — the part after `@`. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1
    ? ''
    : email
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

/** MFA enforcement (pure): a connection that requires MFA blocks a login that didn't satisfy it. */
export function assertMfa(requireMfa: boolean, mfaSatisfied: boolean): void {
  if (requireMfa && !mfaSatisfied) {
    throw new SsoError('MFA_REQUIRED', 'This organization requires multi-factor authentication.');
  }
}

export interface CreateConnectionInput {
  orgId: string;
  protocol: SsoProtocol;
  emailDomain: string;
  issuer: string;
  defaultRole: CustomerRole;
  requireMfa?: boolean;
  metadata?: Record<string, unknown>;
}

/** A verified identity-provider assertion, as the SSO callback would supply it. */
export interface EnterpriseIdentity {
  email: string;
  fullName?: string;
  subject?: string;
  issuer?: string;
  /** Whether the IdP asserted a satisfied second factor (e.g. an `mfa` AMR / step-up ACR claim). */
  mfaSatisfied: boolean;
}

export interface EnterpriseLogin {
  user: User;
  organization: Organization;
  membership: Membership;
  role: CustomerRole;
  connection: SsoConnection;
}

/**
 * Enterprise SSO + MFA (spec §13, P5-02). An org configures its IdP (a connection keyed by email
 * domain) with an EXPLICIT JIT default role; on SSO login we route by domain, enforce MFA, and
 * provision the user into that org with the default role (only on FIRST login — an existing member
 * keeps their role, so SSO never silently changes access).
 */
export const ssoService = {
  createConnection(tx: OrgScopedTx, input: CreateConnectionInput): Promise<SsoConnection> {
    return ssoConnectionsRepo.insert(tx, {
      org_id: input.orgId,
      protocol: input.protocol,
      email_domain: input.emailDomain.trim().toLowerCase(),
      issuer: input.issuer,
      default_role: input.defaultRole,
      require_mfa: input.requireMfa ?? false,
      metadata: input.metadata ?? {},
    });
  },

  listConnections(tx: OrgScopedTx, orgId: string): Promise<SsoConnection[]> {
    return ssoConnectionsRepo.listByOrg(tx, orgId);
  },

  deleteConnection(tx: OrgScopedTx, id: string): Promise<void> {
    return ssoConnectionsRepo.softDelete(tx, id);
  },

  /** Mark the domain verified (after DNS/ownership proof) — JIT provisioning requires this. */
  verifyDomain(tx: OrgScopedTx, id: string): Promise<SsoConnection> {
    return ssoConnectionsRepo.update(tx, id, { domain_verified: true });
  },

  /**
   * Provision (or resume) an enterprise SSO login. Runs on the admin connection (cross-org: a login
   * doesn't know its org until the domain resolves). Throws SsoError to DENY the login.
   */
  async provisionEnterpriseLogin(db: DB, identity: EnterpriseIdentity): Promise<EnterpriseLogin> {
    const domain = emailDomain(identity.email);
    const connection = await db.transaction((tx) =>
      ssoConnectionsRepo.getActiveByDomain(tx, domain),
    );
    if (!connection) {
      throw new SsoError('NO_CONNECTION', `No SSO connection is configured for "${domain}".`);
    }
    if (!connection.domain_verified) {
      throw new SsoError('DOMAIN_UNVERIFIED', `The domain "${domain}" is not verified.`);
    }
    if (identity.issuer && identity.issuer !== connection.issuer) {
      throw new SsoError('ISSUER_MISMATCH', 'The assertion came from an unexpected issuer.');
    }
    assertMfa(connection.require_mfa, identity.mfaSatisfied);

    const user = await accountsService.provisionFromIdentity(db, {
      email: identity.email,
      ...(identity.fullName ? { fullName: identity.fullName } : {}),
      ...(identity.subject ? { subject: identity.subject } : {}),
    });

    // JIT membership only on FIRST login — an existing member keeps their current role.
    let membership = await accountsRepo.getActiveMembership(db, connection.org_id, user.id);
    if (!membership) {
      membership = await accountsRepo.insertMembership(db, {
        org_id: connection.org_id,
        user_id: user.id,
        role: connection.default_role,
        accepted_at: new Date(),
      });
    }
    const organization = (await accountsRepo.getOrganization(db, connection.org_id))!;
    return { user, organization, membership, role: membership.role, connection };
  },
};
