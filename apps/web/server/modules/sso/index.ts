// SSO module (P5-02) — enterprise single sign-on (SAML/OIDC) + MFA. An org configures its identity
// provider keyed by email domain with an EXPLICIT JIT default role; on login we route by domain,
// enforce MFA, and provision the user into the right org with that role (first login only).
export {
  ssoService,
  emailDomain,
  assertMfa,
  type CreateConnectionInput,
  type EnterpriseIdentity,
  type EnterpriseLogin,
} from './service';
export { ssoConnectionsRepo, type SsoConnection } from './repository';
export { ssoConnectionToView } from './view';
export { SsoError, type SsoErrorCode } from './errors';
