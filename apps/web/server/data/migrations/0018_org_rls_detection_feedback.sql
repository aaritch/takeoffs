-- Org isolation for the detection_feedback table (P2-11). Fail-closed RLS like every other
-- customer-owned table; the org-isolation guard test fails the build if an org_id table is uncovered.
SELECT enable_org_rls('detection_feedback');
