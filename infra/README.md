# infra/

Infrastructure, deployment config, and CI definitions.

| Subfolder  | Purpose                                                                                                | Lands in          |
| ---------- | ------------------------------------------------------------------------------------------------------ | ----------------- |
| `vercel/`  | Vercel project + environment config for the app plane (`vercel.json` lives at repo root).              | Phase 0 (P0-04)   |
| `docker/`  | Dockerfiles for the off-Vercel services (workers, realtime, ai-inference).                             | Phase 1 / Phase 2 |
| `ci/`      | GitHub Actions workflows: lint, type-check, test, build. Vercel's git integration handles deploys.     | Phase 0 (P0-08)   |
| `secrets/` | **References only** — actual secrets live in Vercel env / the Phase-2 host's secret store, never here. | Phase 0           |

Notes:

- The spec's Terraform/Kubernetes model is **replaced** for the app plane by Vercel's
  managed platform (see decision log in `build/STATE.md` §7). The Phase-2 compute host for
  workers/AI/realtime is chosen when AI lands; its IaC goes here then.
- Data stores (Phase 0): Neon Postgres + PostGIS, Upstash Redis, Vercel Blob — provisioned
  via Vercel Marketplace integrations and wired through env vars.
- No manual production changes outside config-as-code; environments (`dev`/`staging`/
  `production`) stay isolated with separate credentials.
