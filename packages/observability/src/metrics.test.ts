import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';
import { ERROR_EVENT, METRIC_EVENT, recordError, recordMetric, serializeError } from './metrics';

function capture() {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger(
    { correlationId: 'cid-1' },
    { level: 'debug', sink: (_l, line) => lines.push(JSON.parse(line)) },
  );
  return { logger, lines };
}

describe('metrics + error recording', () => {
  it('records a metric as a structured event carrying the bound correlation id', () => {
    const { logger, lines } = capture();
    recordMetric(logger, 'requests_total', 1, { route: '/api/health' });
    expect(lines[0]).toMatchObject({
      event: METRIC_EVENT,
      metric: 'requests_total',
      value: 1,
      route: '/api/health',
      correlationId: 'cid-1',
    });
  });

  it('a forced error emits an error event AND ticks the errors_total metric', () => {
    const { logger, lines } = capture();
    recordError(logger, new Error('boom'), { route: '/api/health' });
    const err = lines.find((l) => l.event === ERROR_EVENT);
    const metric = lines.find((l) => l.event === METRIC_EVENT && l.metric === 'errors_total');
    expect(err).toMatchObject({ level: 'error', errorName: 'Error', errorMessage: 'boom' });
    expect(metric).toMatchObject({ value: 1, errorName: 'Error' });
  });

  it('serializes non-Error throws safely', () => {
    expect(serializeError('nope')).toEqual({ errorMessage: 'nope' });
  });
});
