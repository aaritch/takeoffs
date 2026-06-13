# Architecture Decision Records

One file per decision, named `NNNN-short-title.md` (e.g. `0001-repo-strategy.md`). Each ADR
records the context, the decision, and the consequences, and is immutable once accepted
(supersede with a new ADR rather than editing).

Decisions are first logged in [`../../build/STATE.md`](../../build/STATE.md) §7; the
significant ones are written up here as ADRs. The first ADRs to write (Phase 0 todo):

- Repository strategy (monorepo; pnpm workspaces + Turborepo)
- Stack choices (Vercel + Next.js full-stack; Neon Postgres + PostGIS; Upstash Redis; Vercel Blob)
- Hosting split by plane (app on Vercel; processing/AI/realtime on a Phase-2 compute host)
- The coordinate / scale model (normalized sheet coordinates; server-authoritative quantities)
