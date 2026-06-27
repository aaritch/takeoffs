-- Org isolation for the retainers table (P3-03). Fail-closed RLS like every other customer-owned
-- table; the org-isolation guard test fails the build if an org_id table is left uncovered.
SELECT enable_org_rls('retainers');
