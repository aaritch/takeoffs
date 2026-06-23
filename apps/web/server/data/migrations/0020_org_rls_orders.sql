-- Org isolation for the orders + order_events tables (P3-01). Fail-closed RLS like every other
-- customer-owned table; the org-isolation guard test fails the build if an org_id table is uncovered.
SELECT enable_org_rls('orders');
--> statement-breakpoint
SELECT enable_org_rls('order_events');
