# Takeoff Platform

Web-based, AI-assisted construction **quantity takeoff** platform. Upload construction
drawings, auto-detect and measure quantities (lengths, areas, counts, volumes) per trade,
review and correct them, and export a bid-ready takeoff. Runs in two modes over one
codebase: **self-serve** and **managed service**.

This is a **monorepo** (pnpm workspaces + Turborepo). The synchronous application plane
(Next.js UI + API) deploys to **Vercel**; the processing, AI/ML, and realtime planes run on
a second compute host (chosen at Phase 2). **GitHub** is the source of truth and drives
deploys.

> **Orientation:** read [`CLAUDE.md`](./CLAUDE.md) for the full architecture, invariants,
> and conventions, and [`build/STATE.md`](./build/STATE.md) for what is done / next /
> blocked. Detailed task cards live in [`build/tasks/`](./build/tasks/). The spec and plan
> are in [`build/`](./build/).

## Prerequisites

- **Node** ≥ 20 (see [`.nvmrc`](./.nvmrc) — 22 matches the Vercel runtime)
- **pnpm** ≥ 9 — enable via Corepack: `corepack enable pnpm`
- **Python** 3.12+ (only for `apps/ai-inference` and `ml/`, from Phase 2)

## Quick start

```bash
corepack enable pnpm     # one-time, makes pnpm available
pnpm install             # install all workspace dependencies
cp .env.example .env     # then fill in local values

pnpm build               # build all packages in dependency order (Turborepo)
pnpm check               # lint + format check + typecheck + test + build
pnpm lint                # ESLint across the repo
pnpm format              # Prettier write
```

## Layout

```
apps/        deployable applications (web = Next.js UI+API; workers; ai-inference)
packages/    shared libraries (contracts, geometry, ui, auth, config, testing)
infra/       Vercel config, Docker images for off-Vercel services, CI, secret refs
ml/          offline model lifecycle (datasets, training, evaluation, registry)
docs/        spec, plan, ADRs, runbooks, API reference
tools/        repo scripts, local-dev orchestration, generators
build/       the build tracker (STATE.md), spec, plan, and per-phase task cards
```

Folders are added **as the phases that need them land** — empty scaffolding rots
(see `build/tasks/TASKS-Phase-0-Foundations.md`, P0-01). Internal packages are published
under the `@takeoff/*` scope and imported only via their package root, never deep paths
(enforced by ESLint).
