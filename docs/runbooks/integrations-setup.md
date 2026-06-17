# Runbook: integrations setup (OIDC · Neon · Upstash · S3 storage)

The code wiring for all four is in place; this is the account setup only you can do. Fill the
env vars (locally in `.env`, and in the Vercel project for hosted). Full annotated list in
[`.env.example`](../../.env.example). Pair with [`vercel-setup.md`](./vercel-setup.md).

---

## 1. OIDC provider (Auth.js / NextAuth v5, generic OIDC)

Pick any compliant provider — Auth0, Logto (generous free tier), Keycloak (self-host),
Microsoft Entra, Google, etc. Then:

1. Create an application/client of type **Web / Authorization Code**.
2. Set the **allowed callback URL** to `${AUTH_URL}/api/auth/callback/oidc`
   (local: `http://localhost:3000/api/auth/callback/oidc`).
3. Set the **sign-out / allowed return URL** to your app origin.
4. Copy the **issuer URL**, **client id**, **client secret**.
5. Env:
   ```
   AUTH_ISSUER_URL=<issuer>
   AUTH_CLIENT_ID=<client id>
   AUTH_CLIENT_SECRET=<client secret>
   AUTH_SECRET=<openssl rand -base64 32>
   AUTH_URL=<app origin>            # http://localhost:3000 locally; your domain in prod
   ```

> Leaving `AUTH_ISSUER_URL` empty disables auth and route-gating (handy for local dev). On
> first login the user is just-in-time provisioned into the `users` table.

## 2. Neon Postgres (+ PostGIS) — TWO roles

RLS only enforces when the app connects as a **non-superuser** role, so use two connections:

1. Create a Neon project + database. Enable PostGIS once: `CREATE EXTENSION IF NOT EXISTS postgis;`
2. **Admin/migrations** → `DATABASE_URL` = Neon's **pooled** connection string (the `-pooler`
   host) for the owner role.
3. Create the **app role** and grant it (run as the owner):
   ```sql
   CREATE ROLE takeoff_app WITH LOGIN PASSWORD '<strong>' NOSUPERUSER NOBYPASSRLS;
   GRANT CONNECT ON DATABASE <db> TO takeoff_app;
   GRANT USAGE ON SCHEMA public TO takeoff_app;
   ALTER DEFAULT PRIVILEGES FOR ROLE <owner> IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO takeoff_app;
   ALTER DEFAULT PRIVILEGES FOR ROLE <owner> IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO takeoff_app;
   ```
4. Run migrations as the owner, then grant on already-created tables:
   ```
   DATABASE_URL=<owner pooled url> pnpm --filter @takeoff/web db:migrate
   DATABASE_URL=<owner pooled url> pnpm --filter @takeoff/web db:seed
   ```
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO takeoff_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO takeoff_app;
   ```
5. Env: `APP_DATABASE_URL=postgres://takeoff_app:<pw>@<pooler-host>/<db>?sslmode=require`

## 3. Upstash Redis

1. Create an Upstash Redis database.
2. Copy the **`rediss://` connection URL** → `REDIS_URL`. (We use `ioredis`, which speaks the
   Redis protocol; the REST API token isn't needed.)

## 4. Object storage — Cloudflare R2 (S3-compatible)

R2 speaks the S3 API, so the existing `S3Storage` adapter works unchanged; MinIO is the local
stand-in. The app uses S3-style presigned URLs for direct uploads (spec §10.2).

1. In the Cloudflare dashboard → **R2** → create a bucket (e.g. `takeoff`). Note your
   **Account ID** (R2 endpoint is `https://<account_id>.r2.cloudflarestorage.com`).
2. **R2 → Manage API Tokens → Create API token** with *Object Read & Write* on the bucket.
   This gives an **Access Key ID** and **Secret Access Key** (S3 credentials).
3. Env (put these in `.env` locally; mirror into Vercel for hosted — see §5):
   ```
   S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=takeoff
   S3_ACCESS_KEY_ID=<R2 access key id>
   S3_SECRET_ACCESS_KEY=<R2 secret access key>
   ```
4. **Configure CORS** (required for direct browser uploads) — apply it programmatically
   instead of hand-editing the dashboard. Allowed origins default to `APP_BASE_URL` +
   `http://localhost:3000`; pass extra origins as args:
   ```
   node --env-file=.env node_modules/.bin/tsx apps/web/server/storage/cli.ts setup-cors https://your-app
   # or, with env already exported:
   pnpm --filter @takeoff/web storage:setup-cors https://your-app
   ```
   This `PutBucketCors`-es the policy (`GET`/`PUT`/`HEAD`, `ETag` exposed) and prints the
   bucket's CORS back so you can confirm it took.
5. **Verify the bucket** end-to-end (server PUT → signed download → signed upload → delete):
   ```
   pnpm --filter @takeoff/web storage:check
   ```
   All four steps must report `PASS`. This is the same code path the local MinIO test uses, so
   a green check here means presigned uploads (P1-01) will work against R2.

> The adapter already forces path-style addressing when an endpoint is set, which R2 supports.
> No application code changes are needed — only these env vars plus the CORS step above.
> The scripts don't auto-load `.env` (same as `db:migrate`/`db:seed`); run them under
> `node --env-file=.env …` or an env-aware shell.

## 5. Wire into Vercel

Add all of the above as Environment Variables in the Vercel project (Production / Preview /
Development), then deploy. Use the Marketplace integrations for Neon/Upstash where available to
auto-inject. See [`vercel-setup.md`](./vercel-setup.md) for project settings.

## Verify

- `GET /api/health` reports which integrations are configured (`storage: true` once the
  `S3_*` vars are set).
- Storage round-trip: `pnpm --filter @takeoff/web storage:check` (see §4 step 5).
- Sign-in: visit `/api/auth/signin` → the SSO button → provider → back to the app; the user
  appears in `users` and the top bar shows them.
