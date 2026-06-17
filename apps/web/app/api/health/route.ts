import { NextResponse } from 'next/server';

// Always evaluated at request time (never during the build), and reads no secrets — only
// reports whether each integration's env var is present, to help verify hosted wiring.
export const dynamic = 'force-dynamic';

export function GET() {
  const configured = (name: string): boolean => Boolean(process.env[name]);

  return NextResponse.json({
    status: 'ok',
    service: 'takeoff-web',
    time: new Date().toISOString(),
    integrations: {
      database: configured('DATABASE_URL'),
      appDatabase: configured('APP_DATABASE_URL'),
      redis: configured('REDIS_URL'),
      storage: configured('S3_BUCKET') && configured('S3_ACCESS_KEY_ID'),
      auth: configured('AUTH_ISSUER_URL'),
    },
  });
}
