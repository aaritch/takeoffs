export type SsoErrorCode =
  | 'NO_CONNECTION'
  | 'DOMAIN_UNVERIFIED'
  | 'ISSUER_MISMATCH'
  | 'MFA_REQUIRED';

/**
 * Enterprise SSO sign-in errors (P5-02). Raised during the identity-provider callback to DENY a
 * login: no SSO connection for the domain, the domain isn't verified (can't pull users in), the
 * assertion came from the wrong issuer, or MFA was required but not satisfied.
 */
export class SsoError extends Error {
  readonly code: SsoErrorCode;
  constructor(code: SsoErrorCode, message: string) {
    super(message);
    this.name = 'SsoError';
    this.code = code;
  }
}
