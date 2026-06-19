import { NextResponse } from 'next/server';
import { withRequestContext } from '@/server/platform/observability';

// Always evaluated at request time (never during the build), and reads no secrets — only
// reports whether each integration's env var is present, to help verify hosted wiring.
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return withRequestContext(request, ({ logger, correlationId }) => {
    // Deliberate failure hook (P0-09 test scenario): `?fail=1` throws so the wrapper records an
    // error event + ticks errors_total + returns the standard 500 envelope — exercising the path
    // the error-rate alert watches.
    if (new URL(request.url).searchParams.get('fail') === '1') {
      throw new Error('forced health failure (fail=1)');
    }

    const configured = (name: string): boolean => Boolean(process.env[name]);
    const integrations = {
      database: configured('DATABASE_URL'),
      appDatabase: configured('APP_DATABASE_URL'),
      redis: configured('REDIS_URL'),
      storage: configured('S3_BUCKET') && configured('S3_ACCESS_KEY_ID'),
      auth: configured('AUTH_ISSUER_URL'),
    };

    logger.info('health check', { event: 'health', integrations });

    return NextResponse.json({
      status: 'ok',
      service: 'takeoff-web',
      time: new Date().toISOString(),
      correlationId,
      integrations,
    });
  });
}
