import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The workspace packages are consumed as TypeScript source (no build step), so Next must
  // transpile them. The server/ domain layer is internal to this app and resolved directly.
  transpilePackages: [
    '@takeoff/contracts',
    '@takeoff/auth',
    '@takeoff/geometry',
    '@takeoff/observability',
    '@takeoff/ui',
  ],
  // Keep the Postgres driver external — it's only used in server route handlers (Node runtime),
  // never bundled for the client.
  serverExternalPackages: ['pg', 'ioredis'],
  // Linting is run by the repo-wide ESLint config in CI, not during the Next build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
