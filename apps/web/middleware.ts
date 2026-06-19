import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { CORRELATION_ID_HEADER } from '@takeoff/contracts';
import { coerceCorrelationId } from '@takeoff/observability';
import { authConfig, authEnabled, isAppRoute } from '@/auth.config';

const { auth } = NextAuth(authConfig);

/**
 * Edge middleware with two jobs on every request:
 *  1. Observability (P0-09): stamp a correlation id — trusting a valid inbound `x-correlation-id`
 *     or minting a new one — and propagate it both to the handler (request header) and the client
 *     (response header), so one request is followable end to end.
 *  2. Auth gating (P0-05/P0-07): redirect the authenticated app routes to sign-in when there is no
 *     user. Replicates the `authorized` callback's behaviour now that we own the response.
 */
export default auth((req) => {
  const correlationId = coerceCorrelationId(req.headers.get(CORRELATION_ID_HEADER));

  let res: NextResponse;
  if (authEnabled && isAppRoute(req.nextUrl.pathname) && !req.auth?.user) {
    const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.href);
    res = NextResponse.redirect(signInUrl);
  } else {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(CORRELATION_ID_HEADER, correlationId);
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  return res;
});

export const config = {
  // Run on every request except Next internals, static files, and NextAuth's own endpoints — so
  // every request gets a correlation id. (Session is only *required* on the app routes, gated above.)
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
