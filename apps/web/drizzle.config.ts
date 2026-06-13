import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for schema diffing and migration generation.
 * Connection comes from DATABASE_URL (local docker stack by default; Neon in hosted envs).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/data/schema/index.ts',
  out: './server/data/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
