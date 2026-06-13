import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

/**
 * Apply pending migrations. Run with `pnpm --filter @takeoff/web db:migrate`.
 * Idempotent: drizzle tracks applied migrations in its own journal table.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
  const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
    console.log('migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
