import { createDb } from './client';
import { seedGlobalTradeData } from '../modules/trades/seed';
import { seedGlobalPricingRules } from '../modules/pricing/seed';

/**
 * Load global seed data. Run with `pnpm --filter @takeoff/web db:seed`.
 * Uses the admin connection (DATABASE_URL); idempotent.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
  const { db, pool } = createDb(url);
  try {
    await seedGlobalTradeData(db);
    await seedGlobalPricingRules(db);
    console.log('global trade/condition + pricing seed loaded');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
