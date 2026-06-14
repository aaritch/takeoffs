-- Org isolation for the takeoff-domain customer tables (P1-10). Same fail-closed RLS as the
-- other customer-owned tables; the guard test requires every org_id table to be covered.
SELECT enable_org_rls('takeoffs');
--> statement-breakpoint
SELECT enable_org_rls('conditions');
