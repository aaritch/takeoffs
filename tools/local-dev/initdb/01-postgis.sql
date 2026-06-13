-- Runs once on first container start (empty data dir), as part of Postgres initdb.
-- The postgis/postgis image already enables PostGIS in the default DB, but we make it
-- explicit and idempotent so the spatial requirement (P0-04) is guaranteed regardless of
-- base image. All Measurement.geometry math depends on this (spec §9).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Fail loudly during init if PostGIS did not load.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE EXCEPTION 'PostGIS extension failed to install';
  END IF;
  RAISE NOTICE 'PostGIS ready: %', postgis_full_version();
END
$$;
