import { uuidv7 } from 'uuidv7';

/**
 * Correlation-id handling. The id originates at the client (or is minted at the edge on the
 * first hop) and is threaded through logs, traces, and downstream messages so one logical
 * request is followable end to end. Pure and edge-safe — no Node-only APIs.
 */

// Accept only header-safe, bounded ids so a malicious/garbage inbound header can't poison logs
// or be reflected unsanitized. Anything else is replaced with a freshly minted id.
const SAFE_ID = /^[A-Za-z0-9._:-]{8,200}$/;

/** True if `value` is a well-formed correlation id we will trust as-is. */
export function isValidCorrelationId(value: string | null | undefined): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

/** Mint a new correlation id (UUID v7 — time-ordered, like our primary keys). */
export function newCorrelationId(): string {
  return uuidv7();
}

/**
 * Return a trustworthy correlation id: the inbound value if it is valid, otherwise a new one.
 * Pass the raw header value (e.g. `headers.get(CORRELATION_ID_HEADER)`).
 */
export function coerceCorrelationId(value: string | null | undefined): string {
  return isValidCorrelationId(value) ? value : newCorrelationId();
}
