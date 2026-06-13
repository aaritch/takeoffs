# On-Demand Takeoff Platform — Project Plan

**Companion to:** Takeoff-Platform-Technical-Spec.md
**Purpose:** Turn the specification into an executable plan — repository layout, who owns what, the contract each component must honor, and a phase-by-phase todo list the team can work through in order.
**Scope:** Hybrid web platform (self-serve + managed service) with AI auto-takeoff and human review.

---

## 1. How to use this plan

- **Section 2** explains the repository strategy and why.
- **Section 3** is the anticipated file tree — the skeleton to scaffold on day one. It is a target, not a contract; folders appear as the phases that need them land.
- **Section 4** defines each component's contract: what it owns, what it consumes, what it produces, and what it must never do. Build these to their contracts and they compose cleanly.
- **Section 5** maps responsibilities to roles so nothing falls between owners.
- **Section 6** is the phased todo list. Phases match the roadmap in the spec; check items off in order. Items marked **(gate)** must pass before the next phase starts.
- **Section 7** lists the milestone "definition of done" gates.

Throughout: the **application plane** is the customer-facing app and API; the **processing plane** is async file/AI work; the **AI plane** is model serving and the training loop. These three planes are the top-level seams in both the file tree and the ownership map.

---

## 2. Repository strategy

Use a **single monorepo** with independently deployable services inside it. Rationale: one place for shared types and contracts, atomic cross-service changes, and one CI pipeline — while still shipping each service as its own container. A package/workspace manager handles the JavaScript/TypeScript side; the Python services live in their own folders with their own dependency definitions.

Top-level seams:

- `apps/` — deployable applications (web client, application API, real-time gateway, worker services, ML services).
- `packages/` — shared libraries consumed by multiple apps (the contract layer, design system, SDKs, config).
- `infra/` — infrastructure as code, container definitions, and deployment manifests.
- `ml/` — model training, evaluation, datasets, and notebooks (separate lifecycle from request-path serving).
- `docs/` — the spec, this plan, ADRs, runbooks, and API reference.
- `tools/` — repo scripts, generators, and local-dev orchestration.

The boundary that matters most: **the contract package is the single source of truth for shapes that cross a network boundary.** Every API request/response shape, event payload, and job message is defined once there and imported by every side. No service re-declares a shared shape locally.

---

## 3. Anticipated file tree

The tree below is the intended structure. It is shown without code fencing per request; directories end with a slash.

takeoff-platform/
- README.md
- package.json — workspace root, scripts, tooling config
- turbo-or-workspace config — task running across packages
- tsconfig.base.json — shared TypeScript settings
- .editorconfig, .gitignore, .env.example
- docs/
  - Takeoff-Platform-Technical-Spec.md
  - Takeoff-Platform-Project-Plan.md
  - adr/ — architecture decision records, one file per decision
  - runbooks/ — on-call and operational procedures
  - api-reference/ — generated API docs
- packages/
  - contracts/ — THE source of truth for cross-boundary shapes
    - src/http/ — request and response schemas per endpoint group
    - src/events/ — real-time event payload schemas
    - src/jobs/ — background job message schemas
    - src/enums/ — shared status and type enumerations
    - src/index — public exports
  - sdk-client/ — typed client the web app uses to call the API
  - ui/ — design system: components, tokens, icons, viewer primitives
  - geometry/ — coordinate, scale, length/area/volume math (shared, pure)
  - auth/ — token handling, permission-check helpers, role definitions
  - config/ — environment loading and validation, shared constants
  - testing/ — shared test utilities, fixtures, factories
- apps/
  - web/ — single-page web client
    - src/
      - app/ — routing, providers, layout shells
      - features/
        - auth/ — sign-in, org switching, invitations
        - projects/ — project list and detail
        - plansets/ — upload, versions, processing status
        - viewer/ — tiled plan viewer and takeoff editor (the core surface)
          - canvas/ — tile rendering, viewport transform
          - overlay/ — vector measurement and AI-candidate layers
          - tools/ — linear, area, count, calibration, snapping
          - panels/ — condition panel, sheet rail, properties
        - takeoffs/ — takeoff lifecycle, conditions, rollups
        - reports/ — report generation and download
        - orders/ — managed-service order placement and tracking
        - billing/ — plan, usage, payment management
        - notifications/ — in-app feed and preferences
      - realtime/ — websocket subscription handling
      - state/ — view state stores and server-state cache wiring
      - styles/ — global styles, theme
    - public/
    - index.html
  - api/ — application API service
    - src/
      - modules/
        - accounts/ — orgs, users, memberships, RBAC
        - projects/
        - plansets/ — upload URLs, processing status
        - sheets/ — sheet metadata, scale calibration
        - takeoffs/
        - conditions/
        - measurements/ — geometry CRUD, bulk accept/reject
        - reports/
        - orders/ — managed-service lifecycle
        - service-ops/ — estimator/QA queues, assignment
        - billing/ — subscriptions, usage, payouts, webhooks
        - notifications/
        - ai-runs/ — trigger and read AI run status
      - platform/ — request context, auth middleware, error envelope, pagination, idempotency
      - data/ — database access layer, migrations, repositories
      - events/ — publishers/consumers for the message broker
      - jobs/ — enqueue helpers for background work
    - migrations/
  - realtime/ — websocket gateway service (presence, live deltas)
  - worker-files/ — file ingestion and processing workers
    - src/
      - ingest/ — validate, scan, inventory, page split
      - rasterize/ — render pages to working raster
      - tiling/ — build deep-zoom tile pyramid and thumbnails
      - extract/ — OCR text, vector extraction, sheet metadata
      - index/ — search indexing
      - pipeline/ — step orchestration, retries, dead-letter handling
  - worker-exports/ — report and export generation workers
  - ai-inference/ — Python ML serving (processing plane)
    - app/
      - pipeline/ — stage orchestration per sheet
      - stages/ — classify, ocr, scale, lines, regions, symbols, vectorize, map, quantify, confidence
      - models/ — model loading from the registry, version pinning
      - serving/ — inference entrypoints, batching
      - contracts/ — stage input/output schemas (mirror of packages/contracts)
    - requirements or pyproject
- ml/ — offline model lifecycle (NOT in the request path)
  - datasets/ — dataset assembly from feedback, manifests, versioning
  - labeling/ — labeling guidelines, schema, import/export
  - training/ — training configs and entrypoints per model family
  - evaluation/ — benchmark sets, metrics, promotion checks
  - registry/ — model registry integration, version metadata
  - notebooks/ — exploration (never imported by services)
- infra/
  - terraform/ — cloud resources per environment (network, db, storage, queues, clusters, CDN)
  - k8s-or-containers/ — deployment manifests per service, GPU pools
  - docker/ — Dockerfiles per service
  - ci/ — pipeline definitions: lint, test, build, deploy
  - secrets/ — references only; actual secrets live in the secrets store
- tools/
  - scripts/ — repo maintenance, codegen, seed data
  - local-dev/ — compose file and orchestration for running the stack locally
  - generators/ — scaffolding for new modules and contracts

---

## 4. Component contracts & responsibilities

Each component is defined by: **Owns** (the state and logic it is responsible for), **Consumes** (inputs from other components), **Produces** (outputs others depend on), and **Must not** (boundaries it may never cross). Honor these and components stay decoupled.

### 4.1 contracts (shared package)

- **Owns:** the canonical definition of every HTTP shape, event payload, job message, and shared enum.
- **Consumes:** nothing at runtime; it is pure definitions.
- **Produces:** typed schemas imported by web, api, realtime, workers, and (mirrored) by the Python services.
- **Must not:** contain business logic, environment config, or anything that imports a service. A change here is a deliberate, reviewed contract change.

### 4.2 web (client)

- **Owns:** all UI, client-side view state, the viewer/editor interaction model, and optimistic edit buffering.
- **Consumes:** the API via the typed client SDK; the realtime gateway for live updates; signed URLs for tiles and exports.
- **Produces:** user intents as API calls; nothing other services depend on.
- **Must not:** compute authoritative quantities, trust its own geometry as final, embed business rules that belong server-side, or call third-party services that should be server-mediated (payments, storage).

### 4.3 api (application API)

- **Owns:** all durable customer/service state, authorization, validation, quantity rollups (authoritative), and orchestration of background work via enqueue.
- **Consumes:** the database, the cache, the message broker, the identity provider, and the payment provider's webhooks.
- **Produces:** API responses, job messages, domain events, and notifications.
- **Must not:** run long/heavy compute inline (must enqueue), bypass the org-isolation filter, or let the client dictate computed values.

### 4.4 realtime (gateway)

- **Owns:** websocket connections, subscription authorization, presence (ephemeral), and delta fan-out.
- **Consumes:** auth tokens; domain events from the broker; the cache for presence.
- **Produces:** live deltas to subscribed clients.
- **Must not:** be a source of truth — it carries deltas only; the database remains authoritative and clients refetch on reconnect.

### 4.5 worker-files (ingestion & processing)

- **Owns:** the file lifecycle from raw upload to viewable, tiled, indexed sheets.
- **Consumes:** source files from object storage; job messages.
- **Produces:** tile pyramids, thumbnails, extracted metadata, sheet records, and an "AI-ready" signal that triggers inference.
- **Must not:** perform AI inference (that is the AI plane) or write business state it does not own beyond sheet/processing records.

### 4.6 ai-inference (ML serving)

- **Owns:** running the staged detection/measurement pipeline per sheet and emitting candidate measurements with confidence.
- **Consumes:** processed sheets, tiles/working rasters, the confirmed-or-candidate scale, and pinned model versions from the registry.
- **Produces:** candidate `Measurement` records (source = AI, unreviewed), a `ModelRun` record with full version lineage, and a partial-failure signal when a stage fails.
- **Must not:** treat its output as authoritative, write final quantities, or proceed past the scale gate when scale confidence is below threshold.

### 4.7 worker-exports (reporting)

- **Owns:** rendering reports and exports as background jobs.
- **Consumes:** authoritative takeoff/condition/rollup data; the marked-plan overlay.
- **Produces:** stored export artifacts and signed download URLs; usage records when beyond quota.
- **Must not:** recompute quantities independently — exports must match the authoritative rollups exactly.

### 4.8 ml (offline lifecycle)

- **Owns:** dataset assembly from feedback, training, evaluation, benchmark sets, and model promotion decisions.
- **Consumes:** `DetectionFeedback` and labeled ground truth; honoring org training opt-outs.
- **Produces:** versioned models registered for the inference plane, with non-regression evidence.
- **Must not:** touch the request path, train on opted-out data, or promote a model that regresses the frozen benchmark.

### 4.9 infra

- **Owns:** all environments, networking, data stores, queues, clusters, GPU pools, CDN, secrets wiring, and CI/CD.
- **Consumes:** service container images and IaC definitions.
- **Produces:** running, isolated `dev` / `staging` / `production` environments and safe deploys with rollback.
- **Must not:** allow manual production changes outside IaC, expose data stores publicly, or share credentials across environments.

### 4.10 Cross-component invariants (always true)

- Org isolation is enforced at the data layer; a missing check fails closed.
- Quantities are computed server-side from authoritative geometry, never from the client or from AI output directly.
- Any work over ~1 second runs as an idempotent, retriable background job.
- Scale must be confirmed before a sheet's quantities count toward a final report.
- Every cross-boundary shape comes from the contracts package.

---

## 5. Responsibilities by role

| Area | Primary owner | Supporting |
|------|---------------|-----------|
| Contracts package & API design | Backend lead | ML lead (stage contracts), Frontend lead (client SDK) |
| Web client & viewer/editor | Frontend engineer(s) | UX/domain estimator |
| Application API & data model | Backend engineer(s) | Backend lead |
| File ingestion/processing workers | Backend engineer(s) | DevOps (compute) |
| AI inference pipeline | ML engineer(s) | Backend (integration) |
| Training/evaluation/flywheel | ML engineer(s) | Domain estimator (labeling, ground truth) |
| Managed-service workflow | Backend engineer(s) | Domain estimator (QA checklist), Ops |
| Billing & payouts | Backend engineer | Founder/owner (pricing rules) |
| Infra, CI/CD, GPU orchestration, cost | DevOps/platform engineer | Backend lead |
| Security & tenant isolation | Backend lead | DevOps, external pen-test |
| Accuracy targets & condition library | Domain estimator | ML lead, Product |
| Observability & runbooks | DevOps/platform engineer | All service owners |

A rule of thumb for hand-offs: the **contracts package change** is the formal interface between two owners. If two people need to agree, they agree on a contract first, then build to it in parallel.

---

## 6. Phased todo lists

Phases mirror the roadmap in the spec. Work top to bottom within a phase. Items marked **(gate)** block the next phase.

### Phase 0 — Foundations

- [ ] Stand up the monorepo with workspace tooling and shared TypeScript config
- [ ] Create the `contracts` package skeleton (http, events, jobs, enums folders)
- [ ] Define core enums in `contracts` (roles, statuses, measurement and unit types)
- [ ] Scaffold `infra/terraform` for `dev` (network, database, object storage, cache, broker)
- [ ] Provision the identity provider and wire OIDC/OAuth2 login end to end
- [ ] Implement `accounts` module: orgs, users, memberships, RBAC policy check
- [ ] Implement org-isolation data-access layer (fail-closed org filter) **(gate)**
- [ ] Establish CI: lint, type-check, unit tests, container build, deploy to staging
- [ ] Stand up observability skeleton: structured logs, request tracing id, basic metrics
- [ ] Write the first ADRs (repo strategy, stack choices, coordinate model)
- [ ] Seed `TradeCategory` structure and a starter condition library with the domain estimator **(gate)**

### Phase 1 — Plans in, measure by hand, report out

- [ ] Implement signed direct-to-storage upload URLs and resumable upload in the client
- [ ] Build `worker-files` ingest: validate, malware scan, page split
- [ ] Build rasterize + tiling steps; produce the deep-zoom pyramid and thumbnails
- [ ] Build extract step: OCR sheet number/title, candidate discipline (editable)
- [ ] Define `PlanSet`/`SourceFile`/`Sheet` processing status model and surface granular progress
- [ ] Build the tiled viewer canvas (pan/zoom against the pyramid) to the performance budget **(gate)**
- [ ] Build the vector overlay layer and selection/hit-testing
- [ ] Implement scale calibration (two-point manual) and the `geometry` math package
- [ ] Implement manual tools: linear, area (with cutouts), count, with snapping and ortho-lock
- [ ] Implement `Condition` CRUD, units, waste/derived-quantity rules
- [ ] Implement server-authoritative quantity rollups and the recompute-on-change path **(gate)**
- [ ] Implement undo/redo in the editor
- [ ] Build report generation (`worker-exports`) for summary/detailed/by-trade/marked-plans
- [ ] Verify exported numbers match rollups exactly **(gate)**
- [ ] Usability pass on the editor with the domain estimator

### Phase 2 — AI takeoff with human review

- [ ] Mirror stage contracts into `ai-inference/contracts` and `packages/contracts`
- [ ] Stand up GPU worker pool and the inference service skeleton
- [ ] Implement pipeline orchestration per sheet with partial-failure handling
- [ ] Implement stages: sheet classification, OCR, scale detection
- [ ] Implement the scale-confidence gate (exclude unconfirmed sheets from final quantities) **(gate)**
- [ ] Implement line/wall segmentation + vectorization
- [ ] Implement region/area detection + vectorization (with cutouts)
- [ ] Implement symbol/object detection for counts
- [ ] Implement classification-to-condition mapping and quantification
- [ ] Implement confidence assembly and candidate scoring
- [ ] Write candidates as unreviewed `Measurement` rows under a `ModelRun`
- [ ] Build the AI-candidate layer in the editor (distinct rendering, hover confidence)
- [ ] Build accept / reject / edit / reclassify, plus bulk-accept-by-confidence
- [ ] Capture every review action as `DetectionFeedback` **(gate)**
- [ ] Build the accuracy dashboard (count F1, quantity error, scale accuracy, review burden)
- [ ] Keep auto-accept conservative; gate any widening on measured per-class accuracy

### Phase 3 — Managed-service marketplace

- [ ] Implement `Order` model and the lifecycle state machine with enforced transitions
- [ ] Build the pricing/turnaround rules table (by tier, trades, sheets, priority)
- [ ] Build order placement UX and quote/confirmation flow
- [ ] Implement estimator assignment (rules-based + admin override) and capacity tracking
- [ ] Reuse the self-serve editor for fulfillment (takeoff origin = managed service)
- [ ] Build the QA workflow and checklist; approve/return-for-revision loop **(gate)**
- [ ] Build delivery: link takeoff, notify customer, unlock exports, accept/dispute window
- [ ] Build the internal ops dashboard (queue, SLA timers, capacity, escalations)
- [ ] Implement `OrderEvent` audit trail for every transition

### Phase 4 — Billing, scale, and the flywheel

- [ ] Integrate subscriptions and seat management with the payment provider
- [ ] Implement usage metering (AI runs, managed orders, exports) and quotas
- [ ] Implement retainer balances and draw-down
- [ ] Implement estimator payouts on order acceptance; pause on dispute **(gate)**
- [ ] Build the `ml` training/evaluation pipeline and the frozen benchmark set
- [ ] Implement model promotion with non-regression checks and version rollout/rollback **(gate)**
- [ ] Implement org-level training opt-out and honor it in dataset assembly
- [ ] Implement assemblies (one geometry populating multiple conditions)
- [ ] Build integration exports to common estimating/accounting targets

### Phase 5 — Hardening & growth

- [ ] Multi-region readiness and disaster-recovery drills (RPO/RTO targets)
- [ ] SSO (SAML/OIDC) and MFA for enterprise customers
- [ ] Outbound webhooks for customer integrations
- [ ] Advanced collaboration (richer presence, comments on measurements)
- [ ] Cloud-storage import for plan sets
- [ ] Continuous model improvement cadence from production feedback
- [ ] External penetration test and remediation

### Cross-cutting (run continuously, every phase)

- [ ] Keep the `contracts` package the single source of truth; no local re-declarations
- [ ] Maintain test coverage at each layer (see §7) before merging
- [ ] Update ADRs and runbooks as decisions and operations evolve
- [ ] Watch and tune queue depth, GPU cost, and inference latency
- [ ] Review audit logs and isolation checks on every new endpoint
- [ ] Track accuracy metrics on every model change; never regress the benchmark

---

## 7. Milestone definition-of-done gates

A phase is "done" only when its gate items pass and the following hold:

- **Phase 1 done:** a user can upload a plan set, see it processed, measure quantities by hand against a confirmed scale, organize them into conditions, and export a report whose numbers exactly match the on-screen rollups.
- **Phase 2 done:** uploading a plan set automatically produces reviewable AI candidates; a reviewer can accept/reject/edit them; every correction is captured as feedback; quantities from unconfirmed-scale sheets are excluded from final reports; accuracy metrics are visible.
- **Phase 3 done:** a customer can order a managed takeoff, an estimator can be assigned and fulfill it, QA can approve it, and the customer can receive and accept the delivered takeoff — with every transition audited and SLAs tracked.
- **Phase 4 done:** the business can charge subscriptions and usage, draw retainers, pay estimators on acceptance, and promote a retrained model only when it clears the benchmark.
- **Overall MVP:** Phases 1–3 complete and stable; Phase 4 billing live enough to take revenue.

### 7.1 Testing expectations per layer

- **Pure logic** (`geometry`, quantity math, scale conversion): exhaustive unit tests — this is where wrong numbers hide.
- **API modules:** integration tests against a real database with org-isolation cases explicitly asserted.
- **Workers/pipeline:** tests for idempotency, retry, and partial-failure paths.
- **AI stages:** evaluation against the benchmark set, tracked over time; unit tests for vectorization/cleanup.
- **Web editor:** interaction tests for tools, undo/redo, and optimistic sync reconciliation.
- **End to end:** the Phase 1 and Phase 3 "definition of done" flows automated as smoke tests in CI.

---

*End of project plan.*
