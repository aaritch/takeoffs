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
