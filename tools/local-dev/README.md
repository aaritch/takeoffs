# Local development stack

A `docker-compose` stack that mirrors the hosted data layer so the app and workers run
end-to-end locally without any cloud accounts.

| Service                   | Local                                                      | Hosted equivalent (prod) |
| ------------------------- | ---------------------------------------------------------- | ------------------------ |
| Postgres + **PostGIS**    | `postgres://takeoff:takeoff@localhost:5432/takeoff`        | Neon Postgres + PostGIS  |
| Redis (cache + job queue) | `redis://localhost:6379`                                   | Upstash Redis            |
| Object storage (S3 API)   | `http://localhost:9000` (console: `http://localhost:9001`) | Vercel Blob              |

Credentials are **local-only and non-secret**. The app reaches object storage through an
adapter, so local MinIO ↔ prod Vercel Blob is a config-only swap.

## Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)

## Usage (from the repo root)

```bash
pnpm dev:up       # start Postgres, Redis, MinIO (detached); creates the dev bucket
pnpm dev:logs     # tail logs
pnpm dev:psql     # open a psql shell on the dev database
pnpm dev:down     # stop containers (keeps data volumes)
pnpm dev:reset    # stop AND delete volumes (fresh slate; re-runs initdb)
```

MinIO console: <http://localhost:9001> — user `takeoff`, password `takeoffdev`, bucket
`takeoff-dev`.

## Environment

Copy these into your repo-root `.env` (they match the stack above). See `.env.example` for
the full annotated list.

```dotenv
DATABASE_URL=postgres://takeoff:takeoff@localhost:5432/takeoff
DATABASE_URL_UNPOOLED=postgres://takeoff:takeoff@localhost:5432/takeoff
# Non-superuser, RLS-subject role for tenant (org-scoped) access — enforces org isolation.
APP_DATABASE_URL=postgres://takeoff_app:takeoff_app@localhost:5432/takeoff
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=takeoff-dev
S3_ACCESS_KEY_ID=takeoff
S3_SECRET_ACCESS_KEY=takeoffdev
```

## Verify PostGIS (P0-04 test scenario)

PostGIS is enabled automatically by `initdb/01-postgis.sql` on first start. To confirm the
spatial extension is present and a spatial column type can be created:

```bash
pnpm dev:psql -- -c "SELECT postgis_version();"
pnpm dev:psql -- -c "CREATE TABLE _spatial_probe (g geometry(Point, 4326)); DROP TABLE _spatial_probe;"
```

Both commands succeeding proves the database tier supports the spatial extension (the
P0-04 caveat) and that geometry columns work — the foundation for all measurement math.

## Notes

- This stack covers **local** development only. Hosted `dev`/`staging`/`production`
  environments are provisioned via Vercel Marketplace integrations (Neon, Upstash, Blob)
  and the Vercel project config — that part of P0-04 needs cloud credentials and is tracked
  as a remaining checklist item in `build/STATE.md`.
- The message broker is the Redis instance above (Redis-backed job queue, per STATE §7);
  no separate RabbitMQ is run locally.
