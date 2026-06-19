import type { NextAuthConfig } from 'next-auth';

/** Authenticated app sections (the `app/(app)` route group's URLs). */
export const APP_PREFIXES = ['/dashboard', '/projects', '/reports', '/orders', '/billing'];

const issuer = process.env.AUTH_ISSUER_URL;

/** Whether auth is configured (an OIDC issuer is set); when false, route gating is disabled. */
export const authEnabled = Boolean(issuer);

/** True if `pathname` is inside an authenticated app section that requires a signed-in user. */
export function isAppRoute(pathname: string): boolean {
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Edge-safe auth config (no database, no Node-only deps) shared by the middleware and the full
 * `auth.ts`. One generic OIDC provider is configured from env, so any compliant provider works
 * (Auth0, Logto, Keycloak, Entra, …). When unconfigured (no AUTH_ISSUER_URL — e.g. local dev),
 * the provider list is empty and route gating is disabled so the shell stays viewable.
 */
export const authConfig = {
  providers: issuer
    ? [
        {
          id: 'oidc',
          name: 'SSO',
          type: 'oidc' as const,
          issuer,
          clientId: process.env.AUTH_CLIENT_ID ?? '',
          clientSecret: process.env.AUTH_CLIENT_SECRET ?? '',
        },
      ]
    : [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      if (!authEnabled) return true; // auth not configured (local/dev) — don't gate
      if (!isAppRoute(nextUrl.pathname)) return true;
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
