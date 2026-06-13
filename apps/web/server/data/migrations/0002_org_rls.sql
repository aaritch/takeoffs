-- Org isolation enforced at the data layer via Row-Level Security (P0-07, GATE).
--
-- `enable_org_rls(table)` turns on RLS, FORCES it (so even the table owner is subject), and
-- installs a fail-closed policy: a row is visible/writable only when its org column equals the
-- per-transaction setting `app.current_org_id`. When that setting is unset, current_setting(..,
-- true) returns NULL, the comparison is false, and NO rows are returned or writable — isolation
-- fails closed, never open. The app sets the value via `withOrgScope` using a non-superuser role
-- (superusers bypass RLS), so the policy actually bites.
--
-- Every NEW customer-owned table (one with an org_id column) MUST call enable_org_rls in its
-- migration. The org-isolation guard test fails the build if one does not.

CREATE OR REPLACE FUNCTION enable_org_rls(target regclass, org_col text DEFAULT 'org_id')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %s', target);
  EXECUTE format(
    'CREATE POLICY org_isolation ON %s '
      || 'USING (%I = nullif(current_setting(''app.current_org_id'', true), '''')::uuid) '
      || 'WITH CHECK (%I = nullif(current_setting(''app.current_org_id'', true), '''')::uuid)',
    target, org_col, org_col
  );
END;
$$;
--> statement-breakpoint
SELECT enable_org_rls('memberships');
--> statement-breakpoint
SELECT enable_org_rls('projects');
