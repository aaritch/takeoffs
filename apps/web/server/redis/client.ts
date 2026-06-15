import Redis from 'ioredis';

/**
 * Redis client (cache, rate limits, job/processing state). `REDIS_URL` works for both the local
 * docker Redis and Upstash (which speaks the Redis protocol over TLS, `rediss://`). Created
 * lazily so importing this module never opens a connection at build time.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
}

let cached: Redis | undefined;

export function getRedis(): Redis {
  if (!cached) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL is not set');
    }
    cached = createRedis(url);
  }
  return cached;
}
