import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

// Edge middleware that gates the authenticated app routes via the `authorized` callback. Uses
// the edge-safe config only (no DB). When auth is unconfigured the callback allows all traffic.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/projects/:path*',
    '/reports/:path*',
    '/orders/:path*',
    '/billing/:path*',
  ],
};
