import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from './client';

// Against the local docker Redis (pnpm dev:up). Upstash speaks the same protocol in prod.
const redis = createRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

afterAll(async () => {
  await redis.quit();
});

describe('redis (local)', () => {
  it('responds to PING', async () => {
    expect(await redis.ping()).toBe('PONG');
  });

  it('sets and gets a value with expiry', async () => {
    await redis.set('tk:test:key', 'value', 'EX', 30);
    expect(await redis.get('tk:test:key')).toBe('value');
    await redis.del('tk:test:key');
  });
});
