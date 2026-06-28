-- Org isolation for the SSO connections table (P5-02). Fail-closed RLS like every other
-- customer-owned (org_id) table; the org-isolation guard fails the build if it's left uncovered.
-- (The login-time domain lookup runs on the admin connection, which bypasses RLS — cross-org by
-- nature, since a login doesn't know its org until the domain resolves.)
SELECT enable_org_rls('sso_connections');
