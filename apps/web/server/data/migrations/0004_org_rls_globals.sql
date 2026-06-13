-- Org isolation for tables that also hold GLOBAL seed rows (org_id IS NULL), e.g. the seed
-- trade structure and starter condition library (P0-10). Same fail-closed model as
-- enable_org_rls, but reads additionally expose global rows to every org; writes are still
-- confined to the caller's own org (a tenant cannot create or alter a global row).

CREATE OR REPLACE FUNCTION enable_org_rls_with_globals(target regclass, org_col text DEFAULT 'org_id')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %s', target);
  EXECUTE format(
    'CREATE POLICY org_isolation ON %s '
      || 'USING (%I IS NULL OR %I = nullif(current_setting(''app.current_org_id'', true), '''')::uuid) '
      || 'WITH CHECK (%I = nullif(current_setting(''app.current_org_id'', true), '''')::uuid)',
    target, org_col, org_col, org_col
  );
END;
$$;
--> statement-breakpoint
SELECT enable_org_rls_with_globals('trade_categories');
--> statement-breakpoint
SELECT enable_org_rls_with_globals('condition_templates');
