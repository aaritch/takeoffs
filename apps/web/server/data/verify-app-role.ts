import { Client } from 'pg';

/**
 * Verify the tenant role (APP_DATABASE_URL → takeoff_app) is wired the way org-isolation
 * depends on: it logs in, it does NOT bypass RLS, it can read global seed data, and an
 * org-scoped table returns ZERO rows when no org context is set (RLS fails closed).
 *
 *   node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs \
 *     apps/web/server/data/verify-app-role.ts
 */
async function main(): Promise<void> {
  const url = process.env.APP_DATABASE_URL;
  if (!url) throw new Error('APP_DATABASE_URL is not set');
  const client = new Client({ connectionString: url });
  await client.connect();
  let failed = false;
  try {
    const who = await client.query(
      'select current_user as u, (select rolbypassrls from pg_roles where rolname = current_user) as bypass',
    );
    const user = who.rows[0].u;
    const bypass = who.rows[0].bypass;
    console.log(`current_user:  ${user}`);
    console.log(`rolbypassrls:  ${bypass}`);
    if (user !== 'takeoff_app') {
      console.error('  ✗ expected takeoff_app');
      failed = true;
    }
    if (bypass !== false) {
      console.error('  ✗ role must NOT bypass RLS');
      failed = true;
    }

    // Global seed (trade_categories) must be readable by the tenant role.
    const trades = await client.query('select count(*)::int as n from trade_categories');
    console.log(`trade_categories visible: ${trades.rows[0].n}`);
    if (trades.rows[0].n < 1) {
      console.error('  ✗ expected seeded trade_categories to be visible');
      failed = true;
    }

    // Org-scoped table with no org context set → RLS must return zero rows (fail closed).
    const projects = await client.query('select count(*)::int as n from projects');
    console.log(`projects (no org ctx): ${projects.rows[0].n}`);
    if (projects.rows[0].n !== 0) {
      console.error('  ✗ org-scoped table leaked rows without org context — RLS not enforced!');
      failed = true;
    }
  } finally {
    await client.end();
  }
  if (failed) {
    console.error('\nVERIFY FAILED');
    process.exitCode = 1;
  } else {
    console.log('\nVERIFY OK — tenant role is RLS-subject and fails closed.');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
