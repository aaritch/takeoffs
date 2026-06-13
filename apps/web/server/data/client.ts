import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
export type DB = NodePgDatabase<Schema>;

export interface DbHandle {
  db: DB;
  pool: pg.Pool;
}

/** Create a database handle for a given connection string (used by tests, workers, scripts). */
export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

let cached: DbHandle | undefined;

/**
 * The process-wide database handle, created lazily from DATABASE_URL on first use. Lazy so
 * that importing the data layer never reads the environment at module-load time.
 */
export function getDb(): DB {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    cached = createDb(url);
  }
  return cached.db;
}
