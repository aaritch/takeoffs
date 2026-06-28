-- Org isolation for the usage_records table (P4-02). Fail-closed RLS like every other customer-owned
-- table; the org-isolation guard test fails the build if an org_id table is left uncovered.
SELECT enable_org_rls('usage_records');
