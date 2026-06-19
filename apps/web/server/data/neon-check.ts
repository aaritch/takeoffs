import { Client } from 'pg';

/**
 * One-off connectivity + capability probe for the hosted Neon database. Read-only except for a
 * PostGIS availability check (does not install it). Run with the owner connection:
 *   node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs apps/web/server/data/neon-check.ts
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('select current_user, current_database(), version()');
    console.log('current_user:    ', who.rows[0].current_user);
    console.log('current_database:', who.rows[0].current_database);
    console.log('version:         ', String(who.rows[0].version).split(',')[0]);

    const su = await client.query(
      'select rolsuper, rolbypassrls from pg_roles where rolname = current_user',
    );
    console.log(
      'rolsuper:        ',
      su.rows[0]?.rolsuper,
      '| rolbypassrls:',
      su.rows[0]?.rolbypassrls,
    );

    const avail = await client.query(
      "select default_version, installed_version from pg_available_extensions where name = 'postgis'",
    );
    if (avail.rows.length === 0) {
      console.log('postgis:          NOT AVAILABLE on this instance');
    } else {
      console.log(
        'postgis:          available',
        avail.rows[0].default_version,
        '| installed:',
        avail.rows[0].installed_version ?? '(not yet)',
      );
    }

    const appRole = await client.query("select 1 from pg_roles where rolname = 'takeoff_app'");
    console.log('takeoff_app role:', appRole.rows.length ? 'exists' : 'absent');

    const tables = await client.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    console.log('public tables:   ', tables.rows[0].n);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
