import Redis from 'ioredis';

/**
 * One-off connectivity probe for the hosted Redis (Upstash). Sets, reads back, and deletes a
 * throwaway key. Run with REDIS_URL in the environment:
 *   node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs \
 *     apps/web/server/redis/redis-check.ts
 */
async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  try {
    await redis.connect();
    const pong = await redis.ping();
    console.log('ping:', pong);
    const key = '_healthcheck:redis';
    await redis.set(key, 'ok', 'EX', 30);
    const val = await redis.get(key);
    await redis.del(key);
    console.log('set/get/del round-trip:', val === 'ok' ? 'OK' : `FAIL (got ${val})`);
    if (val !== 'ok') process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
