import { describe, expect, it } from 'vitest';
import { createLogger, type LogLevel } from './logger';

function capture(level: LogLevel = 'debug') {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger(
    {},
    {
      level,
      now: () => '2026-01-01T00:00:00.000Z',
      sink: (_l, line) => lines.push(JSON.parse(line)),
    },
  );
  return { logger, lines };
}

describe('structured logger', () => {
  it('emits one JSON object per line with time, level, msg, and fields', () => {
    const { logger, lines } = capture();
    logger.info('hello', { userId: 'u1' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      time: '2026-01-01T00:00:00.000Z',
      level: 'info',
      msg: 'hello',
      userId: 'u1',
    });
  });

  it('filters below the configured level', () => {
    const lines: string[] = [];
    const logger = createLogger({}, { level: 'warn', sink: (_l, line) => lines.push(line) });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(lines).toHaveLength(2);
  });

  it('child loggers carry parent bindings into every line', () => {
    const { logger, lines } = capture();
    const child = logger.child({ correlationId: 'cid-1' });
    child.info('a');
    child.info('b', { extra: true });
    expect(lines.every((l) => l.correlationId === 'cid-1')).toBe(true);
    expect(lines[1]).toMatchObject({ extra: true });
  });

  it('redacts sensitive field keys', () => {
    const { logger, lines } = capture();
    logger.info('login', { password: 'hunter2', authToken: 'abc', userId: 'u1' });
    const line = lines[0]!;
    expect(line.password).toBe('[redacted]');
    expect(line.authToken).toBe('[redacted]');
    expect(line.userId).toBe('u1');
  });
});
