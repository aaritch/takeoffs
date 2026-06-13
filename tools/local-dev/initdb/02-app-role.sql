-- Create the NON-SUPERUSER application role used for tenant (org-scoped) queries.
--
-- Why: Row-Level Security (P0-07) is bypassed by superusers and BYPASSRLS roles. The default
-- `takeoff` user is a superuser, so it is used only for migrations and the identity/admin
-- layer. All customer-data access goes through `takeoff_app`, which IS subject to RLS — that
-- is what makes org isolation actually enforced, not merely intended.
--
-- Hosted envs (Neon) create an equivalent least-privilege role; this mirrors it locally.
-- Local-only, non-secret credentials.

CREATE ROLE takeoff_app WITH LOGIN PASSWORD 'takeoff_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE takeoff TO takeoff_app;
GRANT USAGE ON SCHEMA public TO takeoff_app;

-- Tables/sequences are created later by migrations (run as `takeoff`). Default privileges
-- ensure those future objects are usable by `takeoff_app` without re-granting each time.
ALTER DEFAULT PRIVILEGES FOR ROLE takeoff IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO takeoff_app;
ALTER DEFAULT PRIVILEGES FOR ROLE takeoff IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO takeoff_app;
