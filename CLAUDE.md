# CLAUDE.md

Guidance for Claude Code (and any coding agent) working in this repository.

---

## 1. What this project is

An **On-Demand Takeoff Platform**: a web-based, AI-assisted construction _quantity
takeoff_ tool. A contractor uploads construction drawings (a "plan set"); the system
processes them, automatically detects and measures quantities (lengths, areas, counts,
volumes) per trade, and produces a structured, reviewable, exportable **takeoff** — the
itemized quantities needed to price a bid.

It ships in **two modes over one codebase and data model**:

1. **Self-serve** — the user runs the AI takeoff, reviews/corrects results in an
   interactive plan viewer, organizes quantities into trade conditions, and exports a
   report. Billed by subscription and/or per-takeoff usage.
2. **Managed service** — the user uploads a plan set and orders a completed takeoff; an
   internal/contract estimator fulfills and QAs it using the _same_ tools and delivers it
   back. Billed per order, with optional retainers.

> **Glossary fast-path** — Project → PlanSet (a version) → Sheet (a page). A **Takeoff**
> holds **Conditions** (named trade quantity definitions, each with a measurement type +
> unit), and each Condition accumulates **Measurements** (geometry on a sheet). A
> **Report** exports a takeoff. An **Order** is a managed-service request. A **Candidate**
> is an AI-proposed measurement awaiting human review.

---

## 2. Current state of the repo (read this first)

**There is no application code yet.** The repository currently contains only the planning
corpus. Your job is to build the product _from_ these documents, tracked in `STATE.md`.

```
civil-engineer/
├─ CLAUDE.md                          ← this file
├─ build/
│  ├─ STATE.md                        ← THE build tracker (see §3) — start here every session
│  ├─ Takeoff-Platform-Technical-Spec.md   ← the "what": data model, modules, AI, security, NFRs
│  ├─ Takeoff-Platform-Project-Plan.md     ← the "structure": repo layout, file tree, contracts
│  └─ tasks/
│     ├─ TASKS-README-Index.md        ← task conventions + ID scheme
│     ├─ TASKS-Phase-0-Foundations.md
│     ├─ TASKS-Phase-1-Manual-Takeoff.md
│     ├─ TASKS-Phase-2-AI-Takeoff.md
│     ├─ TASKS-Phase-3-Managed-Service.md
│     └─ TASKS-Phase-4-5-Billing-Flywheel-Hardening.md
├─ Lean_AI_Native_Plan.docx           ← early-draft planning notes (superseded by build/*.md)
├─ Lean_Chart_Plan.docx               ← early-draft planning notes (superseded by build/*.md)
└─ takeoffs.pdf                        ← reference material on construction takeoffs
```

The `build/*.md` files are the **authoritative source of truth**. The two `.docx` files
are earlier drafts kept for reference — if they ever conflict with `build/*.md`, the
markdown wins. The working directory is **not yet a git repo**; initialize one
(`git init`) before the first commit if the user wants version control.

### Document hierarchy (which doc answers which question)

| Question                                                  | Document                                   |
| --------------------------------------------------------- | ------------------------------------------ |
| What is done / next / blocked? What did we decide?        | `build/STATE.md`                           |
| What exactly do I build for task `PX-YY`?                 | `build/tasks/TASKS-Phase-X-*.md`           |
| What is the data shape / module rule / API / NFR?         | `build/Takeoff-Platform-Technical-Spec.md` |
| Where does the code go? What's each component's contract? | `build/Takeoff-Platform-Project-Plan.md`   |

If `STATE.md` and any other source disagree about progress, **`STATE.md` wins.**

---

## 3. How to work: the STATE.md loop

`build/STATE.md` is the single place that answers "what's done, what's next, what's
blocked, what was decided." **Update it at the end of every working session.** The loop
for every task (from STATE.md §2):

1. **Pick the next task** — lowest-numbered task that is `NOT_STARTED` and whose
   dependencies are all `DONE` (registry in STATE.md §4 lists deps).
2. **Read its card** — open the matching `TASKS-Phase-*.md` and read that task's
   _Implementation details_, _Test scenarios_, and _Caveats_ in full before writing anything.
3. **Set status `IN_PROGRESS`** in the registry + Current-focus section; add name/date.
4. **Write the tests first** where practical — the scenarios are already enumerated.
5. **Implement to the contract** — every cross-boundary shape lives in `packages/contracts`.
6. **Run the tests** — all listed scenarios, including failure/edge cases, must pass.
7. **Self-review against the caveats.**
8. **Set status `DONE`** (or `IN_REVIEW`); note anything future tasks need in STATE.md §7.
9. **If blocked**, set `BLOCKED`, log it in STATE.md §6, pick another unblocked task.
10. **Update Section 1 + phase counters** before stopping.

**Status values (use exactly these):** `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`,
`IN_REVIEW`, `DONE`.

### GATEs — never cross one without passing tests

A **GATE** task blocks the start of the next phase. They concentrate where mistakes are
expensive to undo. Treat a failing gate as a release blocker. Current gates (STATE.md §5):

- **P0-07** — Org isolation proven across every entity (fail-closed)
- **P0-10** — Seed trades and conditions exist and are estimator-approved
- **P1-06** — Viewer meets the performance budget on representative hardware
- **P1-11** — Quantity rollups are server-authoritative and tamper-proof
- **P1-14** — Exports match rollups exactly
- **P2-05** — Unconfirmed-scale sheets excluded from final reports
- **P2-11** — Every AI correction captured as feedback
- **P3-06** — QA checklist gates delivery
- **P4-04** — Payouts only on acceptance or auto-accept
- **P4-05** — Training data respects opt-outs; benchmark frozen
- **P4-06** — Model promotion blocks regressions; rollback works

### Decisions are logged, not re-litigated

Decisions live in STATE.md §7. Several launch values are still **TBD** and must be settled
with the domain estimator before dependent tasks proceed — don't invent them silently;
log the assumption if you must proceed. Open TBDs include: working raster DPI;
self-intersecting-polygon policy; the launch trade list + condition units; per-class
auto-accept thresholds; order dispute/auto-accept windows. Mirror significant decisions
into an ADR under `docs/adr/`.

---

## 4. Cross-cutting invariants — NEVER violate these, on any task

These are the rules that keep the product correct, secure, and trustworthy. They appear in
STATE.md §9 and the plan's §4.10. A change that breaks one of these is a defect regardless
of what the task asked for.

1. **Quantities are server-authoritative.** Computed server-side from authoritative
   geometry — _never_ trusted from the client or from raw AI output. The client only
   displays cached rollups.
2. **Heavy work is a background job.** Anything longer than ~1 second (file conversion,
   tiling, OCR, AI inference, large report/export generation) runs as an **idempotent,
   retriable** background job that writes durable status the client polls/subscribes to.
   The HTTP request path only _enqueues_ and _reads status_.
3. **Scale gate.** A sheet's quantities count toward a _final_ report only after its scale
   is **confirmed**. Below the confidence threshold, quantities are provisional and excluded.
4. **Org isolation fails closed.** Enforced at the data-access layer — a query without org
   context returns nothing/errors, never cross-org rows. Every new customer-owned table
   gets the `org_id` filter. Object-storage keys are namespaced by org.
5. **Contracts are the single source of truth.** Every cross-boundary shape (HTTP
   request/response, event payload, job message, shared enum) is defined once in
   `packages/contracts` and imported everywhere — no local re-declarations. The Python
   services _mirror_ these.
6. **Benchmark non-regression.** Every model change is measured against the frozen
   benchmark and must never regress it.
7. **Money & time formats.** Money is stored in **integer minor units** (cents) with an
   ISO-4217 code — never floats. Timestamps are stored in **UTC** (timezone-aware),
   rendered to the user's locale on the client.

When a task touches **money, geometry/quantities, or cross-tenant access**, slow down —
those three are where correctness matters most and mistakes are most damaging.

---

## 5. Architecture: three planes

The system splits into three planes that communicate only through a shared database,
object storage, and a message broker — never by reaching into each other's internals.
**These planes are hosted in two places** (see §6): the application plane on **Vercel**,
the processing/AI/realtime planes on a **second compute home** (chosen at Phase 2).

1. **Application plane** — customer-facing API + web client. Accounts, projects, files,
   takeoff editing, reporting, orders, billing. Synchronous request/response.
2. **Processing plane** — async, compute-heavy: file ingestion, rasterization/tiling, OCR,
   AI inference. Driven by a job queue.
3. **AI/ML plane** — model serving, training, evaluation, the feedback loop. Isolated so
   models deploy/scale/roll back independently.

### Component contracts (Owns / Must-not, condensed from Plan §4)

| Component         | Owns                                                                 | Must NOT                                                                                    |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `contracts` (pkg) | Canonical cross-boundary shapes + enums                              | Hold business logic, env config, or import a service                                        |
| `web`             | UI, view state, viewer/editor interaction, optimistic buffering      | Compute authoritative quantities; embed server-side rules; call payments/storage directly   |
| `api`             | Durable state, authz, validation, **authoritative rollups**, enqueue | Run heavy compute inline; bypass org filter; let client dictate computed values             |
| `realtime`        | WS connections, subscription authz, presence, delta fan-out          | Be a source of truth (deltas only; DB is authoritative)                                     |
| `worker-files`    | File lifecycle: raw upload → tiled, indexed sheets                   | Do AI inference; write business state beyond sheet/processing records                       |
| `ai-inference`    | Staged detection pipeline per sheet; candidates + confidence         | Treat output as authoritative; write final quantities; pass the scale gate below threshold  |
| `worker-exports`  | Render reports/exports as jobs                                       | Recompute quantities — must match authoritative rollups exactly                             |
| `ml` (offline)    | Dataset assembly, training, eval, promotion                          | Touch the request path; train on opted-out data; promote a regressing model                 |
| `infra`           | Environments, network, data stores, queues, GPU pools, CDN, CI/CD    | Allow manual prod changes outside IaC; expose data stores publicly; share creds across envs |

---

## 6. Hosting & tech stack

> **Hosting decisions (settled — see STATE.md §7).** The product is hosted on **Vercel**
> with **GitHub** as the source of truth and deploy trigger. Vercel cannot run GPU
> inference, long background workers, or persistent WebSocket gateways, so hosting is
> **split by plane** (see §5). These choices override the spec's Vite/NestJS/Kubernetes
> recommendations where they conflict.

The stack below reflects those decisions. Where the spec (§4) named something different,
the spec's choice is the _alternative_, not the default.

| Layer                       | Default choice                                                                                                | Notes vs. spec                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Frontend + application API  | **Next.js (App Router) + TypeScript**, deployed on **Vercel**                                                 | **Replaces** Vite SPA + standalone NestJS. UI + synchronous API live in one Next.js app (Route Handlers / serverless functions). |
| Client state                | **Zustand** (view state) + **TanStack Query** (server state)                                                  | unchanged                                                                                                                        |
| Plan viewer                 | Tiled deep-zoom raster pyramid + vector overlay on **Canvas/WebGL**                                           | unchanged — the core surface                                                                                                     |
| Domain/business logic       | Framework-agnostic TS modules under `apps/api` (or a package), called by Route Handlers                       | Keep logic out of Next.js handlers so it stays testable and portable off Vercel.                                                 |
| AI/ML services              | **Python with FastAPI** (hosted on the second compute home)                                                   | host **TBD at Phase 2**                                                                                                          |
| Background workers / queues | Redis-backed job queue (app); Celery (ML)                                                                     | **Not on Vercel** — run on the Phase-2 compute home                                                                              |
| Message broker              | Managed queue or RabbitMQ / Redis Streams                                                                     | second compute home                                                                                                              |
| Primary DB                  | **Neon Postgres with PostGIS** (Vercel Marketplace integration)                                               | satisfies the required spatial extension                                                                                         |
| Cache / job state           | **Upstash Redis** (Vercel Marketplace integration)                                                            | serverless-friendly Redis                                                                                                        |
| Object storage              | **Vercel Blob** or an **S3-compatible** bucket                                                                | source files, tiles, exports, model artifacts                                                                                    |
| Search                      | OpenSearch/Elasticsearch (Postgres FTS early)                                                                 | unchanged                                                                                                                        |
| CDN                         | **Vercel Edge Network** in front of the app; tiles/exports via Blob/CDN                                       | replaces CloudFront-style CDN                                                                                                    |
| Auth                        | OIDC/OAuth2 hosted identity provider (no raw passwords stored)                                                | unchanged                                                                                                                        |
| Payments                    | **Stripe** (Billing + Connect for payouts)                                                                    | unchanged                                                                                                                        |
| Containers / GPU            | **TBD at Phase 2** — serverless GPU (Modal/Replicate) or a container host (Render/Fly/AWS)                    | replaces Kubernetes/GPU-pool assumption for the app plane                                                                        |
| IaC                         | **`vercel.json`** + Vercel project config for the app plane; provider config for the Phase-2 compute home     | replaces Terraform/Kubernetes for what Vercel manages                                                                            |
| CI/CD                       | **Vercel Git integration** (deploy on push) + **GitHub Actions** (lint, type-check, tests)                    | replaces self-hosted pipeline runner                                                                                             |
| Observability               | Structured logs + traces + metrics, correlation-id from day one (Vercel logs/analytics + app instrumentation) | unchanged in intent                                                                                                              |

**Language split:** the synchronous application plane is TypeScript (Next.js); the ML
services are Python. Contracts are language-neutral and shared via `packages/contracts`
(mirrored on the Python side).

### Hosting split by plane (because Vercel ≠ everything)

- **Application plane → Vercel.** Next.js frontend + synchronous API. Short-lived
  request/response only — it _enqueues_ heavy work and _reads status_, never runs it.
- **Processing + AI/ML + realtime planes → a second compute home (host TBD at Phase 2).**
  File ingestion/rasterize/tiling/OCR workers, the GPU inference pipeline, model
  training/eval, and the persistent WebSocket gateway. None of these fit Vercel's execution
  model.
- **GitHub** holds all source; pushing to the default branch deploys the app via Vercel's
  git integration. Production deploys stay gated (protected branch / Vercel promotion).

This split matters from **Phase 0**: build the application API so its long/heavy operations
are enqueued to a queue that an _external_ worker drains — never executed inline in a Vercel
function. Phases 0–1 (upload, viewer, manual takeoff) run fine on Vercel + Neon + Upstash +
Blob; the worker/GPU host only becomes necessary at Phase 2.

---

## 7. Target repository layout

The repo is a **single monorepo** with independently deployable services. Folders appear
as the phases that need them land — do **not** scaffold feature folders before their phase
(empty scaffolding rots). Target tree (Plan §3):

Adjusted for the Vercel/Next.js decision: the spec's separate `apps/web` (Vite) and
`apps/api` (NestJS) **collapse into one Next.js app** deployed on Vercel. The worker and
AI apps remain separate (they deploy to the Phase-2 compute home, not Vercel).

```
takeoff-platform/                    (current root: civil-engineer/)
├─ package.json, tsconfig.base.json, .env.example, workspace config
├─ vercel.json     Vercel project config for the app
├─ docs/            spec, plan, adr/, runbooks/, api-reference/
├─ packages/
│  ├─ contracts/    src/{http,events,jobs,enums}/  ← single source of truth
│  ├─ ui/           design system: components, tokens, viewer primitives
│  ├─ geometry/     coordinate/scale/length/area/volume math (pure, exhaustively tested)
│  ├─ auth/         token handling, permission-check helpers, role defs
│  ├─ config/       env loading + validation
│  └─ testing/      shared fixtures and factories
├─ apps/
│  ├─ web/          ← Next.js (App Router): the UI **and** the synchronous application API
│  │   ├─ app/      routes + Route Handlers (the /v1 API); UI under feature routes
│  │   │            features: auth, projects, plansets, viewer, takeoffs, reports, orders, billing, notifications
│  │   │            viewer (canvas / overlay / tools / panels) is the core, most complex surface
│  │   └─ server/   framework-agnostic domain layer the Route Handlers call:
│  │                modules/{accounts,projects,plansets,sheets,takeoffs,conditions,measurements,
│  │                reports,orders,service-ops,billing,notifications,ai-runs}
│  │                + platform/ (request context, authz, errors, pagination, idempotency)
│  │                + data/ (Postgres access, migrations, repositories) + events/ + jobs/ (enqueue only)
│  ├─ realtime/     websocket gateway (presence, live deltas) — NOT on Vercel
│  ├─ worker-files/ src/{ingest,rasterize,tiling,extract,index,pipeline} — NOT on Vercel
│  ├─ worker-exports/  report/export generation workers — NOT on Vercel
│  └─ ai-inference/ Python; app/{pipeline,stages,models,serving,contracts} — NOT on Vercel (GPU)
├─ ml/              datasets/, labeling/, training/, evaluation/, registry/, notebooks/
├─ infra/           vercel/ (project + env config), docker/ (worker/AI images), ci/ (GitHub Actions), secrets/ (refs only)
└─ tools/           scripts/, local-dev/, generators/
```

> Note: the SPA's `sdk-client` package is unnecessary with Next.js full-stack (UI and API
> share the repo and types directly via `packages/contracts`); skip it unless an external
> consumer appears.

> When you create the monorepo (task **P0-01**), move `build/*.md` into `docs/` so the spec
> and plan live where the tree expects them, and keep `STATE.md` reachable as the tracker.

---

## 8. Domain rules that bite (geometry, scale, AI)

- **Normalized sheet coordinates.** All `Measurement.geometry` is stored in a per-sheet
  coordinate space independent of raster DPI, using Postgres spatial types. Real-world
  values are derived only via the sheet scale. (Spec §9)
- **Scale conversion.** `linear = geometric_length × unit_per_pixel`;
  `area = geometric_area × unit_per_pixel²`. The AI pipeline and the manual tools MUST use
  the **identical** conversion.
- **Canonical base units.** Store length in feet, area in square feet, volume in cubic
  feet; convert for display/export. Never store only the display-converted number.
- **Rounding.** Compute in full precision; round only for display/export (default: lengths
  to 0.1, areas to whole units, counts exact). Rollups store full precision.
- **Holes/cutouts.** Polygon areas subtract interior rings. Reject self-intersecting
  polygons for area conditions; warn on degenerate geometry; clamp to sheet bounds.
- **Derived quantities** (area×height → volume/surface; length×height → wall surface) must
  be **explicit** on the condition, never silently assumed.
- **AI is always reviewable, never silently authoritative.** Candidates are
  `Measurement` rows with `source=AI`, `review_status=UNREVIEWED`. Every accept/reject/edit
  writes a `DetectionFeedback` row (the training signal). Auto-accept stays **conservative**
  until per-class accuracy is proven, and is always visible + reversible.
- **AI pipeline stages** (Spec §7.2), each persisted so any can re-run independently:
  classify → OCR → scale detect → line/wall seg → region/area detect → symbol detect →
  vectorize/cleanup → class→condition mapping → quantify → confidence assembly.
- **Inference tolerates partial failure** — one stage/sheet failing yields
  `ModelRun.status=PARTIAL`, not a dead set. Re-running a sheet _replaces_ its candidate
  set under a new `ModelRun`, never duplicates.

---

## 9. Phased roadmap (59 tasks across 6 phases)

Build in phase order; respect dependencies within a phase. Each phase is shippable and
de-risks the next.

- **Phase 0 — Foundations** (10 tasks): monorepo, contracts, enums, dev IaC, identity/auth,
  accounts+RBAC, **org-isolation gate**, CI/CD, observability, **seed trades gate**.
- **Phase 1 — Manual takeoff** (14 tasks): upload → ingest → tile → **viewer gate** →
  vector overlay → scale calibration + geometry pkg → manual tools → conditions →
  **server-authoritative rollups gate** → undo/redo → reports → **export-parity gate**.
  _A usable self-serve takeoff product without AI; validates the hardest UX (the viewer) early._
- **Phase 2 — AI takeoff with human review** (12 tasks): stage contracts, GPU pool,
  orchestration, classify/OCR/scale stages, **scale-confidence gate**, line/area/symbol
  detection, mapping+quantify, candidate layer, accept/reject/edit, **feedback-capture
  gate**, accuracy dashboard.
- **Phase 3 — Managed-service marketplace** (9 tasks): order model + state machine,
  pricing/turnaround rules, placement flow, assignment+capacity, fulfillment in the shared
  editor, **QA gate**, delivery/accept/dispute, ops dashboard, audit trail.
- **Phase 4 — Billing, scale, flywheel** (8 tasks): subscriptions+seats, usage
  metering+quotas, retainers, **payouts gate**, **training/eval pipeline gate**, **model
  promotion+rollback gate**, assemblies, integration exports.
- **Phase 5 — Hardening & growth** (6 tasks): multi-region/DR, SSO+MFA, webhooks, advanced
  collaboration, cloud-storage import, security review + pen test.

**MVP = Phases 1–3 complete and stable; Phase 4 billing live enough to take revenue.**

---

## 10. Conventions & non-functional bars

- **Naming:** Entities `PascalCase`; fields `snake_case`; enum values `UPPER_SNAKE_CASE`.
- **IDs:** UUID v7 (time-orderable) for primary keys.
- **Common columns:** every entity has `id`, `created_at`, `updated_at`, nullable
  soft-delete `deleted_at`, and (customer-owned) `org_id`.
- **API:** versioned `/v1` HTTP/JSON; resource-oriented plural nouns; **cursor-based
  pagination** (never offset on large tables); **idempotency keys** on create/charge
  endpoints; consistent error envelope (machine code + human message + field details);
  every request authenticated and org/role-authorized server-side.
- **Testing expectations per layer (Plan §7.1):**
  - Pure logic (`geometry`, quantity/scale math): _exhaustive_ unit tests — wrong numbers hide here.
  - API modules: integration tests against a real DB with org-isolation cases asserted explicitly.
  - Workers/pipeline: idempotency, retry, and partial-failure paths.
  - AI stages: evaluation against the benchmark over time; unit tests for vectorization/cleanup.
  - Web editor: interaction tests for tools, undo/redo, optimistic-sync reconciliation.
  - E2E: the Phase 1 and Phase 3 "definition of done" flows as CI smoke tests.
- **Performance bars (Spec §15):** API read p95 < 300 ms; write p95 < 600 ms; viewer first
  overview paint < 300 ms; pan/zoom 60 fps (never blocking); drawing reflects < 16 ms/frame;
  uptime 99.9%; job success after retries > 99.5%; RPO ≤ 5 min; RTO ≤ 1 hr.
- **Security baseline:** parameterized queries only; validate input + encode output at
  every boundary; scan uploads + verify type (derived artifacts never execute); per-org and
  per-user rate limiting; append-only `AuditLog` for security-relevant actions; secrets in a
  managed store, never in code/images.

---

## 11. Environment & platform notes

- **OS:** Windows 11; shell is **PowerShell** (use `$null`, `$env:VAR`, backtick line
  continuation; Bash is also available via the Bash tool for POSIX scripts). Repo path:
  `C:\repos\civil-engineer`.
- **Not a git repo yet** — run `git init` before the first commit. **GitHub is the source
  of truth**; the repo connects to a Vercel project so pushes to the default branch deploy
  the app, and **GitHub Actions** runs lint/type-check/tests.
- **Hosting:** application plane on **Vercel**; processing/AI/realtime planes on a second
  compute home (chosen at Phase 2). Data: **Neon Postgres + PostGIS**, **Upstash Redis**,
  **Vercel Blob** (or S3-compatible) — wired via Vercel env vars / Marketplace integrations.
- Local dev for the full stack belongs in `tools/local-dev/` (a compose file) once services
  exist — run Postgres+PostGIS, Redis, and workers locally even though they deploy off-Vercel.

---

## 12. Working agreements for the agent

- **Start every session by reading `build/STATE.md`** — it tells you the active phase/task
  and any blockers/decisions. End every session by updating it (use the §10 handoff template).
- **Read the task card in full** (`TASKS-Phase-*.md`) before writing code for a task —
  Implementation details, Test scenarios, _and_ Caveats. The caveats exist because they're
  the traps.
- **Don't skip the test step, and never cross a GATE without its tests passing.**
- **Put every cross-boundary shape in `packages/contracts`** — no local re-declarations.
- **Don't invent TBD decisions** — if a value isn't settled in STATE.md §7, log the
  assumption you're proceeding under, or surface the question to the user.
- **Keep folders phase-appropriate** — create a module's folder when its phase lands, not before.
