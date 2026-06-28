import { describe, expect, it } from 'vitest';
import { isTransient, nextAttemptAt, MAX_ATTEMPTS } from './retry';
import { signPayload, verifySignature } from './signing';

describe('webhook signing (pure, P5-03)', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ id: 'e1', type: 'ORDER_DELIVERED', data: { orderId: 'o1' } });
  const nowSec = 1_900_000_000;

  it('a consumer can verify a signature it received', () => {
    const header = signPayload(secret, nowSec, body);
    expect(verifySignature(secret, header, body, { nowSec })).toBe(true);
  });

  it('rejects a tampered body, a wrong secret, and a stale timestamp', () => {
    const header = signPayload(secret, nowSec, body);
    expect(verifySignature(secret, header, body + ' ', { nowSec })).toBe(false); // tampered
    expect(verifySignature('whsec_other', header, body, { nowSec })).toBe(false); // wrong secret
    expect(verifySignature(secret, header, body, { nowSec: nowSec + 10_000 })).toBe(false); // stale
    expect(verifySignature(secret, 'garbage', body, { nowSec })).toBe(false);
  });
});

describe('webhook retry policy (pure, P5-03)', () => {
  it('retries transient failures (5xx, 408, 429, network) but not permanent 4xx', () => {
    expect(isTransient(500)).toBe(true);
    expect(isTransient(503)).toBe(true);
    expect(isTransient(429)).toBe(true);
    expect(isTransient(408)).toBe(true);
    expect(isTransient(null)).toBe(true); // network/timeout
    expect(isTransient(400)).toBe(false);
    expect(isTransient(404)).toBe(false);
  });

  it('schedules backed-off retries until attempts are exhausted, then gives up', () => {
    const now = new Date('2026-06-28T00:00:00Z');
    const first = nextAttemptAt(1, now);
    const second = nextAttemptAt(2, now);
    expect(first).not.toBeNull();
    expect(second!.getTime()).toBeGreaterThan(first!.getTime()); // exponential backoff grows
    expect(nextAttemptAt(MAX_ATTEMPTS, now)).toBeNull(); // exhausted → no more retries
  });
});
