import type { LogFields, Logger } from './logger';

/**
 * Log-based metrics + error recording. On serverless (Vercel), in-process counters are useless —
 * every invocation is isolated — so the durable signal is a structured log event the platform
 * (or a log drain) aggregates. `recordMetric` emits `event:"metric"` lines; `recordError` emits
 * `event:"error"` lines. The first alert (error-rate spike, P0-09) counts the latter.
 */

export const METRIC_EVENT = 'metric';
export const ERROR_EVENT = 'error';

/** Flatten an unknown thrown value into safe, structured fields. */
export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack };
  }
  return { errorMessage: String(error) };
}

/** Emit a counter/gauge sample as a structured log line (default value 1 = a counter tick). */
export function recordMetric(logger: Logger, name: string, value = 1, fields?: LogFields): void {
  logger.info(`metric ${name}`, { event: METRIC_EVENT, metric: name, value, ...fields });
}

/** Record an error: emits an `error`-level, `event:"error"` line and ticks the error metric. */
export function recordError(logger: Logger, error: unknown, fields?: LogFields): void {
  logger.error('request error', { event: ERROR_EVENT, ...serializeError(error), ...fields });
  recordMetric(logger, 'errors_total', 1, { errorName: (error as Error)?.name });
}
