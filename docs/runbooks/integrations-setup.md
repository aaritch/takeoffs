# Runbook: integrations setup (OIDC · Neon · Upstash · S3 storage)

The code wiring for all four is in place; this is the account setup only you can do. Fill the
env vars (locally in `.env`, and in the Vercel project for hosted). Full annotated list in
[`.env.example`](../../.env.example). Pair with [`vercel-setup.md`](./vercel-setup.md).

---

## 1. OIDC provider (Auth.js / NextAuth v5, generic OIDC)

The app uses one **generic OIDC provider** (id `oidc`), so any compliant IdP works. The live
setup uses **Microsoft Entra ID**, provisioned via the **Azure CLI** (no browser app config).

**Live path — Microsoft Entra ID via Azure CLI:**

```
# Prereq: Azure CLI installed (winget install Microsoft.AzureCLI) and `az login` to the target tenant.

# 1. Create a single-tenant app registration with the local + prod redirect URIs:
az ad app create --display-name "Takeoff Platform" --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "http://localhost:3000/api/auth/callback/oidc" \
                      "https://<your-app>.vercel.app/api/auth/callback/oidc"
#   → note the appId (client id) and id (object id)

# 2. Emit email in the id token (Entra omits it by default; JIT provisioning needs it):
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/<objectId>" \
  --headers "Content-Type=application/json" \
  --body '{"optionalClaims":{"idToken":[{"name":"email"},{"name":"preferred_username"}]}}'

# 3. Mint a client secret (capture `password` — it is shown once):
az ad app credential reset --id <appId> --display-name "takeoff-web" --years 2
```

Then set env (issuer = the tenant's v2.0 endpoint):

```
AUTH_ISSUER_URL=https://login.microsoftonline.com/<tenant-id>/v2.0
AUTH_CLIENT_ID=<appId>
AUTH_CLIENT_SECRET=<password from step 3>
AUTH_SECRET=<openssl rand -base64 32>         # or PowerShell RNG → base64(32 bytes)
AUTH_URL=<app origin>                          # http://localhost:3000 locally; prod domain in prod
```

Verify (with the dev server running): `GET /api/auth/providers` lists `oidc`; a POST to
`/api/auth/signin/oidc` (with the `/api/auth/csrf` token) 302s to the Entra `authorize`
endpoint carrying the right `client_id`, `redirect_uri`, PKCE, and `scope=openid profile email`.

> **Other providers** (Auth0, Logto, Keycloak, Google…): create a Web / Authorization-Code
> client, set the callback to `${AUTH_URL}/api/auth/callback/oidc`, and fill the same five env
> vars from the provider's issuer/client id/secret.
>
> **Notes:** Single-tenant (`AzureADMyOrg`) restricts sign-in to your Entra directory; use
> `AzureADMultipleOrgs` for external orgs. Preview deploys have dynamic URLs that won't match a
> fixed redirect URI, so OIDC login is for local + the stable prod domain. Leaving
> `AUTH_ISSUER_URL` empty disables auth + route-gating (handy for local dev). On first login the
> user is just-in-time provisioned into the `users` table.

## 2. Neon Postgres (+ PostGIS) — TWO roles

RLS only enforces when the app connects as a **non-superuser, NOBYPASSRLS** role, so use two
connections: the Neon **owner** (`DATABASE_URL`, for migrations/admin — note Neon's owner has
`rolbypassrls=true`, so it must NOT be the tenant connection) and a dedicated **`takeoff_app`**
role (`APP_DATABASE_URL`, for all org-scoped data access).

**Fastest path — Vercel Marketplace + bootstrap script (this is how the live env was set up):**

```
# 1. Provision Neon and connect it to the project (creates DATABASE_URL etc. across all envs,
#    and pulls them into .env.local):
vercel integration add neon            # accept-terms first if prompted: vercel integration accept-terms neon --yes

# 2. Initialize the database against the OWNER connection. db:bootstrap is idempotent: enables
#    PostGIS, creates the takeoff_app role (NOSUPERUSER NOBYPASSRLS), and grants it CRUD +
#    default privileges. Provide a password for the role via APP_DB_PASSWORD.
node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs apps/web/server/data/bootstrap-db.ts
node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs apps/web/server/data/migrate.ts
node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs apps/web/server/data/seed.ts
# re-run bootstrap once more so the now-created tables get granted to takeoff_app
node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs apps/web/server/data/bootstrap-db.ts

# 3. Build APP_DATABASE_URL = DATABASE_URL with user/password swapped to takeoff_app:<APP_DB_PASSWORD>,
#    add it to .env.local and to Vercel (all environments).

# 4. Verify the tenant role is RLS-subject and fails closed:
node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs apps/web/server/data/verify-app-role.ts
```

`db:bootstrap` / `db:check` / `db:verify-role` are also exposed as `pnpm --filter @takeoff/web`
scripts (they read `process.env`, so prefix with `node --env-file=.env.local …` or export the env).

> **Manual equivalent** (if not using the Marketplace flow): create the role and grants by hand —
> `CREATE ROLE takeoff_app WITH LOGIN PASSWORD '<strong>' NOSUPERUSER NOBYPASSRLS;` then the
> `GRANT CONNECT/USAGE` + `ALTER DEFAULT PRIVILEGES … GRANT …ON TABLES/SEQUENCES TO takeoff_app`
> statements, run migrations as the owner, then `GRANT … ON ALL TABLES/SEQUENCES IN SCHEMA public`.
> `APP_DATABASE_URL=postgres://takeoff_app:<pw>@<pooler-host>/<db>?sslmode=require`.

## 3. Upstash Redis

**Fastest path — Vercel Marketplace (this is how the live env was set up):**

```
vercel integration add upstash/upstash-kv   # accept-terms first if prompted: vercel integration accept-terms upstash --yes
```

This provisions Upstash for Redis, connects it to the project, and sets `REDIS_URL` (+ `KV_*`
REST vars) across all environments. We use `ioredis`, which speaks `REDIS_URL` directly; the
REST token isn't needed. Verify:

```
node --env-file=.env.local apps/web/node_modules/tsx/dist/cli.mjs apps/web/server/redis/redis-check.ts
```

> **Manual equivalent:** create an Upstash Redis database and copy its `rediss://` URL → `REDIS_URL`.

## 4. Object storage — Cloudflare R2 (S3-compatible)

R2 speaks the S3 API, so the existing `S3Storage` adapter works unchanged; MinIO is the local
stand-in. The app uses S3-style presigned URLs for direct uploads (spec §10.2).

1. In the Cloudflare dashboard → **R2** → create a bucket (e.g. `takeoff`). Note your
   **Account ID** (R2 endpoint is `https://<account_id>.r2.cloudflarestorage.com`).
2. **R2 → Manage API Tokens → Create API token** with _Object Read & Write_ on the bucket.
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
