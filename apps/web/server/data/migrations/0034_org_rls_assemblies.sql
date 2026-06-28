-- Org isolation for the assembly tables (P4-07). Fail-closed RLS like every other customer-owned
-- (org_id) table; the org-isolation guard fails the build if one is left uncovered.
SELECT enable_org_rls('assemblies');
--> statement-breakpoint
SELECT enable_org_rls('assembly_components');
--> statement-breakpoint
SELECT enable_org_rls('assembly_instances');
