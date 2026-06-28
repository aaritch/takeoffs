-- Org isolation for the comments table (P5-04). Fail-closed RLS like every other customer-owned
-- (org_id) table; the org-isolation guard fails the build if it's left uncovered.
SELECT enable_org_rls('comments');
