import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook payload signing (P5-03). Every delivery is signed with the endpoint's secret so the
 * receiver can verify it genuinely came from us and wasn't tampered with — webhooks leave our trust
 * boundary (the caveat). Scheme (Stripe-style): sign `"{timestamp}.{body}"` with HMAC-SHA256; the
 * header is `t=<unix-seconds>,v1=<hex>`. The timestamp is signed too, so a replayed body with a stale
 * time fails verification within a tolerance window.
 */
export const SIGNATURE_HEADER = 'x-takeoff-signature';
export const EVENT_ID_HEADER = 'x-takeoff-event-id';
export const EVENT_TYPE_HEADER = 'x-takeoff-event-type';
const DEFAULT_TOLERANCE_SEC = 300;

export function signPayload(secret: string, timestampSec: number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex');
  return `t=${timestampSec},v1=${mac}`;
}

function parseHeader(header: string): { t: number; v1: string } | null {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || typeof parts.v1 !== 'string') return null;
  return { t, v1: parts.v1 };
}

/**
 * Verify a signature header against the body + secret (what a CONSUMER does). Constant-time compare;
 * rejects a stale timestamp outside the tolerance window. `nowSec` is injectable for deterministic tests.
 */
export function verifySignature(
  secret: string,
  header: string,
  body: string,
  opts: { toleranceSec?: number; nowSec?: number } = {},
): boolean {
  const parsed = parseHeader(header);
  if (!parsed) return false;
  const tolerance = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.t) > tolerance) return false;
  const expected = createHmac('sha256', secret).update(`${parsed.t}.${body}`).digest('hex');
  const a = Buffer.from(parsed.v1, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
