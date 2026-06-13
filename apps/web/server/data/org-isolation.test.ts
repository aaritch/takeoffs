import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from './client';

// Guard test (P0-07 caveat): fail the build if a customer-owned table (one with an org_id
// column) is ever introduced WITHOUT row-level-security isolation. Introspects the live schema
// via the admin connection, so it cannot be fooled by application code.
const url = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

let handle: DbHandle;

beforeAll(async () => {
  handle = createDb(url);
  await migrate(handle.db, { migrationsFolder });
});

afterAll(async () => {
  await handle.pool.end();
});

async function orgOwnedTables(): Promise<string[]> {
  const res = await handle.db.execute(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'org_id'
    order by table_name
  `);
  return (res.rows as { table_name: string }[]).map((r) => r.table_name);
}

describe('org-isolation guard', () => {
  it('recognises the known customer-owned tables', async () => {
    const tables = await orgOwnedTables();
    expect(tables).toContain('memberships');
    expect(tables).toContain('projects');
  });

  it('every table with an org_id column has RLS enabled, forced, and a policy', async () => {
    const tables = await orgOwnedTables();
    expect(tables.length).toBeGreaterThan(0);

    for (const table of tables) {
      const res = await handle.db.execute(sql`
        select c.relrowsecurity as rls,
               c.relforcerowsecurity as forced,
               (select count(*)::int from pg_policies p
                  where p.schemaname = 'public' and p.tablename = ${table}) as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = ${table}
      `);
      const row = (res.rows as { rls: boolean; forced: boolean; policies: number }[])[0];
      expect(row, `no pg_class row for ${table}`).toBeDefined();
      expect(row!.rls, `${table}: RLS not enabled`).toBe(true);
      expect(row!.forced, `${table}: RLS not forced`).toBe(true);
      expect(row!.policies, `${table}: no RLS policy`).toBeGreaterThanOrEqual(1);
    }
  });
});
