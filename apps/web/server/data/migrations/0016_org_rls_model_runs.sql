-- Org isolation for the model_runs table (P2-02/03). Fail-closed RLS like every other
-- customer-owned table; the org-isolation guard test fails the build if an org_id table is uncovered.
SELECT enable_org_rls('model_runs');
