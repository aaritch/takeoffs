import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER } from '@takeoff/contracts';
import { getCurrentCorrelationId, getLogger, withRequestContext } from './observability';

function req(url: string, headers?: Record<string, string>): Request {
  return new Request(url, headers ? { headers } : undefined);
}

afterEach(() => vi.restoreAllMocks());

describe('withRequestContext', () => {
  it('follows a request by its inbound correlation id — in the response header and the logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const cid = '0190f8e2-7a1b-7c3d-8e4f-1a2b3c4d5e6f';

    const res = await withRequestContext(
      req('http://x/api/health', { [CORRELATION_ID_HEADER]: cid }),
      ({ logger }) => {
        // Deep code can grab the request logger / id from context with no manual threading.
        expect(getCurrentCorrelationId()).toBe(cid);
        logger.info('handling');
        return NextResponse.json({ ok: true });
      },
    );

    expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(cid);
    // Every emitted line (the "handling" log + the request_complete metric) carries the id.
    const lines = log.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.every((l) => l.correlationId === cid)).toBe(true);
    expect(lines.some((l) => l.metric === 'request_complete' && l.status === 200)).toBe(true);
  });

  it('mints a valid correlation id when the inbound header is absent', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await withRequestContext(req('http://x/api/health'), () =>
      NextResponse.json({ ok: true }),
    );
    const header = res.headers.get(CORRELATION_ID_HEADER);
    expect(header).toMatch(/^[A-Za-z0-9._:-]{8,200}$/);
  });

  it('turns a forced error into a 500 envelope + an error event, keeping the correlation id', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cid = 'forced-err-correlation-id';

    const res = await withRequestContext(
      req('http://x/api/health', { [CORRELATION_ID_HEADER]: cid }),
      () => {
        throw new Error('boom');
      },
    );

    expect(res.status).toBe(500);
    expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(cid);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR' });
    const errLines = err.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(errLines.some((l) => l.event === 'error' && l.correlationId === cid)).toBe(true);
  });

  it('getLogger() outside a request returns the base logger (no throw)', () => {
    expect(() => getLogger().info('outside request')).not.toThrow();
  });
});
