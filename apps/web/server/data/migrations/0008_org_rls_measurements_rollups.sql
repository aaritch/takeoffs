-- Org isolation for the measurement + rollup tables (P1-11). Fail-closed RLS like the other
-- customer-owned tables; the guard test requires every org_id table to be covered.
SELECT enable_org_rls('measurements');
--> statement-breakpoint
SELECT enable_org_rls('quantity_rollups');
