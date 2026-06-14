import { sql } from 'drizzle-orm';
import { createDb, type DB, type DbHandle } from './client';

let appHandle: DbHandle | undefined;

/**
 * The process-wide app database handle for TENANT (org-scoped) access, created lazily from
 * APP_DATABASE_URL. This connects as the non-superuser `takeoff_app` role, which is subject to
 * RLS — unlike the admin/identity connection (`getDb`, DATABASE_URL) used by the accounts layer.
 */
export function getAppDb(): DB {
  if (!appHandle) {
    const url = process.env.APP_DATABASE_URL;
    if (!url) {
      throw new Error('APP_DATABASE_URL is not set');
    }
    appHandle = createDb(url);
  }
  return appHandle.db;
}

/** The transaction handle passed to a scoped callback (same query API as the database). */
export type OrgScopedTx = Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * Run `fn` with the caller's org scope active, inside a single transaction. This is the ONE
 * place org context is injected: it sets `app.current_org_id` (LOCAL to the transaction) so the
 * RLS policies constrain every read and write to `orgId`. There is no way to query a
 * customer-owned table without going through here — and outside this scope the setting is unset,
 * so RLS returns nothing and rejects writes (fail closed).
 *
 * `set_config(..., true)` is parameterized (no string interpolation) and transaction-local.
 */
export async function withOrgScope<T>(
  db: DB,
  orgId: string,
  fn: (tx: OrgScopedTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/**
 * The org id of the active scope, read back from the transaction setting. Lets scoped code set a
 * new row's org_id directly from the scope (so it always matches the RLS WITH CHECK) without
 * threading the id through every call. Throws if called outside an org scope.
 */
export async function currentOrgId(tx: OrgScopedTx): Promise<string> {
  const res = await tx.execute(
    sql`select nullif(current_setting('app.current_org_id', true), '') as org_id`,
  );
  const orgId = (res.rows as { org_id: string | null }[])[0]?.org_id;
  if (!orgId) {
    throw new Error('No org scope is active');
  }
  return orgId;
}
