import { Client } from 'pg';

/**
 * Idempotent hosted-DB bootstrap, run with the OWNER connection (DATABASE_URL):
 *   - enables PostGIS (spec requires the spatial extension),
 *   - creates/updates the NON-superuser, NOBYPASSRLS tenant role `takeoff_app` (the role that
 *     makes org-isolation RLS actually bite — the Neon owner has rolbypassrls=true),
 *   - grants it CRUD on the public schema now and by default for future tables/sequences.
 *
 * Safe to run repeatedly. Run it BEFORE migrate (sets default privileges for tables migrate
 * will create) and AGAIN AFTER migrate (grants on the tables that now exist).
 *
 *   node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs \
 *     apps/web/server/data/bootstrap-db.ts
 *
 * Requires APP_DB_PASSWORD in the environment (the password for takeoff_app).
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (owner connection) is not set');
  const appPassword = process.env.APP_DB_PASSWORD;
  if (!appPassword)
    throw new Error('APP_DB_PASSWORD is not set (password for the takeoff_app role)');

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const meta = await client.query('select current_user as owner, current_database() as db');
    const owner: string = meta.rows[0].owner;
    const db: string = meta.rows[0].db;
    const qOwner = `"${owner.replace(/"/g, '""')}"`;
    const qDb = `"${db.replace(/"/g, '""')}"`;

    await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
    console.log('postgis: enabled');

    // Create or update the tenant role. Password is passed as a parameter-free literal because
    // role DDL cannot be parameterized; pg escapes it via the dollar-quoted format below.
    const roleExists = await client.query("select 1 from pg_roles where rolname = 'takeoff_app'");
    const pwLiteral = `'${appPassword.replace(/'/g, "''")}'`;
    if (roleExists.rows.length === 0) {
      await client.query(
        `CREATE ROLE takeoff_app WITH LOGIN PASSWORD ${pwLiteral} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
      );
      console.log('takeoff_app role: created');
    } else {
      // Only set LOGIN + PASSWORD here. The SUPERUSER/BYPASSRLS attributes are fixed at CREATE
      // time and cannot be re-asserted by a non-superuser owner (Neon rejects it), so re-running
      // must not touch them — they are already NOSUPERUSER/NOBYPASSRLS from creation.
      await client.query(`ALTER ROLE takeoff_app WITH LOGIN PASSWORD ${pwLiteral}`);
      console.log('takeoff_app role: updated (password reset)');
    }

    await client.query(`GRANT CONNECT ON DATABASE ${qDb} TO takeoff_app`);
    await client.query('GRANT USAGE ON SCHEMA public TO takeoff_app');
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${qOwner} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO takeoff_app`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${qOwner} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO takeoff_app`,
    );
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO takeoff_app',
    );
    await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO takeoff_app');
    console.log('grants: applied (current + default privileges for future objects)');

    const tables = await client.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
    );
    console.log(`public base tables: ${tables.rows[0].n}`);
    console.log('bootstrap OK');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
