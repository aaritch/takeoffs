-- Org isolation for the webhook tables (P5-03). Fail-closed RLS like every other customer-owned
-- (org_id) table; the org-isolation guard fails the build if one is left uncovered.
SELECT enable_org_rls('webhook_endpoints');
--> statement-breakpoint
SELECT enable_org_rls('webhook_deliveries');
