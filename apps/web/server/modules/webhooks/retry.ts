/**
 * Webhook retry policy (P5-03), pure. Transient failures (network errors, 5xx, 408, 429) are retried
 * with exponential backoff up to a cap; permanent failures (other 4xx) are not — the receiver
 * rejected it for a reason a retry won't fix.
 */
export const MAX_ATTEMPTS = 5;
const BASE_DELAY_SEC = 30;
const MAX_DELAY_SEC = 3600;

/** Whether a result warrants a retry. `statusCode` is null for a network/timeout error. */
export function isTransient(statusCode: number | null): boolean {
  if (statusCode === null) return true; // network/timeout
  if (statusCode === 408 || statusCode === 429) return true;
  return statusCode >= 500;
}

/** Backoff before the next attempt after `attemptCount` attempts (exponential, capped). */
export function backoffSeconds(attemptCount: number): number {
  return Math.min(BASE_DELAY_SEC * 2 ** (attemptCount - 1), MAX_DELAY_SEC);
}

/** When to next attempt after a transient failure, or null if attempts are exhausted. */
export function nextAttemptAt(
  attemptCount: number,
  now: Date,
  maxAttempts = MAX_ATTEMPTS,
): Date | null {
  if (attemptCount >= maxAttempts) return null;
  return new Date(now.getTime() + backoffSeconds(attemptCount) * 1000);
}
