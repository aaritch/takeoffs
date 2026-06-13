# @takeoff/web

The **application plane** — the Next.js UI + synchronous `/v1` API, deployed on Vercel.

> **Status:** the Next.js runtime (routes, providers, auth wiring) lands in **P0-05**. Right
> now this package holds the framework-agnostic **server domain** under `server/` so it can
> be built and tested against the local Postgres without Next.js or a live identity provider.

## Layout (current)

```
server/
├─ data/
│  ├─ schema/        Drizzle tables — the relational model (spec §5)
│  ├─ client.ts      pg-backed Drizzle handle (createDb / lazy getDb)
│  ├─ migrate.ts     apply migrations (pnpm db:migrate)
│  └─ migrations/    generated SQL (pnpm db:generate)
└─ modules/
   └─ accounts/      orgs, users, memberships, RBAC AuthContext, account rules (P0-06)
```

The permission check lives in `@takeoff/auth`; this package builds the `AuthContext` from the
database (`resolveAuthContext`) and enforces account-level rules (seats, last-owner, etc.).

## Database scripts

```bash
pnpm --filter @takeoff/web db:generate   # diff schema -> SQL migration
pnpm --filter @takeoff/web db:migrate    # apply migrations (uses DATABASE_URL)
```

## Tests

`pnpm --filter @takeoff/web test` runs integration tests against Postgres. Start the local
stack first: `pnpm dev:up` (root). Tests apply migrations, then truncate between cases.
