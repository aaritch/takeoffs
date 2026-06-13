# On-Demand Takeoff Platform — Technical Specification

**Document type:** Build specification (engineering blueprint)
**Product:** Web-based, AI-assisted construction quantity takeoff platform
**Model:** Hybrid — self-serve takeoff tooling + managed-service fulfillment marketplace
**Primary platform:** Responsive web application
**AI scope:** Automated takeoff (detection + measurement) from launch, with human review
**Audience for this doc:** Founding/technical team building the product end to end

---

## 1. How to read this document

This specification is organized so that each section can be handed to the responsible engineer or squad and built largely in isolation. It defines **what** to build and the **exact** shape of data, services, interfaces, and behavior — not the line-by-line code. Where a specific technology is named, it is a recommendation with stated rationale; an explicitly listed alternative may be substituted without changing the architecture.

Conventions used throughout:

- **MUST / SHOULD / MAY** follow their usual meaning in requirements writing. MUST is non-negotiable for a correct system; SHOULD is strongly recommended; MAY is optional.
- **Entity** names are written in `PascalCase`; **field** names in `snake_case`; **enum values** in `UPPER_SNAKE_CASE`.
- All money is stored in integer **minor units** (cents) with an ISO-4217 currency code. Never store money as a floating-point number.
- All timestamps are stored in UTC as timezone-aware values and rendered to the user's locale on the client.
- All measurement geometry is stored in a normalized coordinate space (defined in §9) plus a derived real-world value.

---

## 2. Product overview

### 2.1 What the platform does

A contractor or land developer uploads a set of construction drawings (a "plan set"). The system processes those drawings, automatically detects and measures quantities (lengths, areas, counts, and volumes) for the relevant trades, and produces a structured, reviewable, exportable **takeoff**: the itemized quantities a contractor needs to price a bid.

The product operates in two complementary modes that share one codebase and data model:

1. **Self-serve mode.** The user runs the AI takeoff themselves, reviews and corrects the results in an interactive plan viewer, organizes quantities into trade conditions, and exports a bid-ready report. Billed by subscription and/or per-takeoff usage.
2. **Managed-service mode.** The user uploads a plan set and places an order for a completed takeoff. An internal or contracted estimator is assigned, fulfills and quality-checks the takeoff using the same tools, and delivers it back through the portal. Billed per order, with optional volume retainers.

The same AI engine, viewer, measurement tools, and reporting back the entire experience; managed-service simply adds an order/assignment/fulfillment workflow on top.

### 2.2 Primary user roles

| Role | Belongs to | Core capability |
|------|-----------|-----------------|
| `OWNER` | Customer org | Full control of the customer account, billing, members, all projects |
| `ADMIN` | Customer org | Manage members and projects; no billing control |
| `ESTIMATOR_MEMBER` | Customer org | Create/run/edit takeoffs within assigned projects |
| `VIEWER` | Customer org | Read-only access to projects and reports |
| `SERVICE_ESTIMATOR` | Platform/service side | Claim and fulfill managed-service orders across customer orgs |
| `SERVICE_QA` | Platform/service side | Review and approve fulfilled orders before delivery |
| `PLATFORM_ADMIN` | Platform operator | Full operational control, support impersonation, configuration |

Roles are assigned **per organization** (customer side) and **per platform** (service side). A single human account MAY hold a customer role in one org and a service role on the platform; permissions are evaluated in the context of the resource being accessed.

### 2.3 Core objects the user thinks in terms of

- **Project** — a single bid or job, owns one or more plan sets.
- **Plan set** — an uploaded collection of drawing pages (one version of the documents).
- **Sheet** — a single page of a plan set (e.g., a floor plan, a detail sheet).
- **Takeoff** — the full set of measured quantities for a project, organized into conditions.
- **Condition** — a named, trade-specific quantity definition (e.g., "8" CMU wall", "R-30 ceiling insulation"). Each condition has a measurement type and a unit, and accumulates measurements across sheets.
- **Measurement** — a single geometric object (a line, polygon, point cluster, or solid) attached to a condition on a specific sheet.
- **Report** — a generated, exportable summary of conditions and their quantities.
- **Order** — a managed-service request to have a takeoff completed by the service team.

---

## 3. System architecture

### 3.1 Architectural style

A **modular service-oriented architecture** with a clear split between three planes:

1. **Application plane** — the customer-facing API and the web client. Handles accounts, projects, files, takeoff editing, reporting, orders, and billing. Synchronous, request/response.
2. **Processing plane** — asynchronous, compute-heavy work: file ingestion, drawing rasterization/tiling, OCR, and AI inference. Driven by a job queue, not by user requests.
3. **AI/ML plane** — model serving, training, evaluation, and the data/feedback loop. Isolated so models can be deployed, scaled, and rolled back independently of the app.

These planes communicate through (a) a shared relational database for durable state, (b) object storage for large binary artifacts, and (c) a message broker / job queue for asynchronous hand-offs. No plane reaches into another plane's internal data structures directly; they exchange well-defined messages and records.

### 3.2 Logical components

- **Web client** — single-page application; the plan viewer and takeoff editor are the most complex part.
- **Application API** — primary business API for all customer and service operations.
- **File ingestion service** — accepts uploads, validates, fans out processing jobs.
- **Drawing processing service** — converts source documents into a multi-resolution tiled raster pyramid and an extracted text/vector layer.
- **AI inference service** — runs the detection and measurement models against processed sheets; emits candidate measurements with confidence scores.
- **Takeoff service** — owns conditions, measurements, geometry math, and quantity rollups.
- **Reporting/export service** — renders reports and export files.
- **Order/fulfillment service** — managed-service order lifecycle, assignment, QA, delivery.
- **Billing service** — subscriptions, usage metering, per-order charges, estimator payouts.
- **Notification service** — email, in-app, and webhook notifications.
- **Training & evaluation pipeline** — offline model lifecycle (separate from request path).

### 3.3 Request vs. background boundary (critical)

Anything that takes longer than ~1 second or depends on heavy compute MUST run as a **background job**, not inside an HTTP request. The user-facing API only *enqueues* work and *reads status*. The following are always background: file conversion, tiling, OCR, AI inference, report generation for large sets, and bulk exports. Each background job MUST be idempotent (safe to retry) and MUST write its status to a durable record the client can poll or subscribe to.

---

## 4. Recommended technology stack

Each row lists the recommendation, why, and a viable alternative. The architecture does not depend on any single choice.

| Layer | Recommendation | Why | Alternative |
|-------|----------------|-----|-------------|
| Web client framework | React + TypeScript | Largest hiring pool, mature canvas/WebGL ecosystem | Vue 3 + TypeScript |
| Client build tooling | Vite | Fast builds and dev server | Next.js (if SSR/SEO marketing pages share the app) |
| Client state | Zustand for view state; TanStack Query for server state | Keeps the heavy editor responsive; clean cache/invalidation | Redux Toolkit + RTK Query |
| Plan viewer rendering | Tiled deep-zoom raster viewer + vector overlay (Canvas/WebGL) | Handles very large drawings smoothly at any zoom | Custom WebGL tile renderer |
| Application API | TypeScript on Node with NestJS | Strong typing end-to-end, structured modules, good DX | Python with FastAPI (if you want one language with ML) |
| AI/ML services | Python with FastAPI | The ML ecosystem is Python-first | — (keep ML in Python regardless) |
| Async jobs (app) | A Node job queue backed by Redis | Reliable, observable, retriable | Cloud-native queue + workers |
| Async jobs (ML) | Celery (Python) backed by the broker | Standard for Python compute pipelines | RQ / custom workers |
| Message broker | Managed queue service (e.g., hosted SQS-style) or RabbitMQ | Durable hand-off between planes | Redis Streams for smaller scale |
| Primary database | PostgreSQL with the spatial extension enabled | Relational integrity + native geometry math for measurements | — (spatial support is required) |
| Cache / ephemeral | Redis | Sessions, rate limits, job state, hot lookups | Memcached (cache only) |
| Object storage | S3-compatible bucket storage | Stores source files, tiles, exports, model artifacts | GCS / Azure Blob |
| Search | OpenSearch/Elasticsearch | Project/sheet/condition search at scale | Postgres full-text (early stage) |
| CDN | CloudFront-style CDN in front of tiles and exports | Fast tile delivery is essential to viewer feel | Any global CDN |
| Auth | OIDC/OAuth2 provider (hosted identity) | Offloads credential security, SSO-ready | Self-hosted identity server |
| Payments | Stripe (Billing + Connect for payouts) | Subscriptions, usage billing, and marketplace payouts in one | Adyen / Braintree |
| Email | Transactional email provider | Deliverability and templating | Self-hosted SMTP (not advised) |
| Containers | Docker | Standard packaging | — |
| Orchestration | Managed Kubernetes or managed container service | Independent scaling per service incl. GPU pools | Container service (ECS-style) for smaller teams |
| Infra as code | Terraform | Reproducible environments | Pulumi |
| CI/CD | Pipeline runner attached to the repo host | Automated test + deploy | Any CI with container build + deploy |
| Observability | Metrics + logs + traces stack | Required from day one (see §16) | Hosted observability vendor |
| Experiment tracking | A model registry + experiment tracker | Model lineage and rollback | Self-managed registry |

**Language split rationale.** Keeping the application API in a strongly typed Node stack and the ML services in Python gives each plane the best ecosystem while keeping a clean network boundary between them. A team that prefers a single language MAY run the entire backend in Python with FastAPI; the contracts in this document are language-neutral.

---

## 5. Data model

This is the canonical relational model. Every entity has, unless noted: a primary key `id` (UUID v7 recommended for time-orderability), `created_at`, `updated_at`, and soft-delete `deleted_at` (nullable). Multi-tenancy is enforced by an `org_id` column on every customer-owned row plus row-level access checks in the API (see §13.3).

### 5.1 Accounts & access

**`Organization`** — a customer company.
`id`, `name`, `slug`, `billing_customer_ref` (payment provider id), `plan_tier` (`FREE` | `STARTER` | `PRO` | `RETAINER`), `seat_limit`, `status` (`ACTIVE` | `PAST_DUE` | `SUSPENDED`), `created_by_user_id`.

**`User`** — a human login (global, not org-scoped).
`id`, `email` (unique, citext), `full_name`, `avatar_url`, `auth_provider_subject` (id from the identity provider), `status` (`ACTIVE` | `INVITED` | `DISABLED`), `last_seen_at`.

**`Membership`** — links a `User` to an `Organization` with a role.
`id`, `org_id`, `user_id`, `role` (one of the customer roles in §2.2), `invited_by_user_id`, `accepted_at`.

**`ServiceProfile`** — platform-side identity for fulfillment staff.
`id`, `user_id`, `role` (`SERVICE_ESTIMATOR` | `SERVICE_QA` | `PLATFORM_ADMIN`), `trade_specialties` (array), `payout_account_ref`, `active` (bool), `current_capacity` (integer concurrent orders).

### 5.2 Projects & documents

**`Project`** — a bid/job.
`id`, `org_id`, `name`, `client_name`, `location_text`, `project_type` (`RESIDENTIAL` | `COMMERCIAL` | `SITEWORK` | `MIXED`), `bid_due_at` (nullable), `status` (`OPEN` | `BIDDING` | `SUBMITTED` | `WON` | `LOST` | `ARCHIVED`), `created_by_user_id`.

**`PlanSet`** — one uploaded version of the documents for a project.
`id`, `org_id`, `project_id`, `version_number` (auto-increment per project), `label`, `source_file_count`, `total_sheet_count`, `processing_status` (see §10.4), `uploaded_by_user_id`.

**`SourceFile`** — a single uploaded file inside a plan set.
`id`, `plan_set_id`, `original_filename`, `mime_type`, `byte_size`, `storage_key` (object-storage path), `checksum_sha256`, `page_count`, `ingest_status`.

**`Sheet`** — one drawing page after processing.
`id`, `org_id`, `plan_set_id`, `source_file_id`, `index_in_set` (ordinal), `sheet_number` (extracted, e.g., "A-101"), `sheet_title` (extracted), `discipline` (`ARCHITECTURAL` | `STRUCTURAL` | `MECHANICAL` | `ELECTRICAL` | `PLUMBING` | `CIVIL` | `LANDSCAPE` | `UNKNOWN`), `width_px`, `height_px`, `dpi`, `tile_pyramid_key` (object-storage prefix for tiles), `thumbnail_key`, `scale_status` (`UNSET` | `AUTO` | `CONFIRMED`).

**`SheetScale`** — the real-world scale calibration for a sheet.
`id`, `sheet_id`, `units` (`IMPERIAL` | `METRIC`), `unit_per_pixel` (double, real-world distance per normalized pixel), `calibration_method` (`AI_DETECTED` | `TWO_POINT_MANUAL` | `SCALE_LABEL`), `confidence` (0–1, nullable for manual), `set_by` (`SYSTEM` | `USER`), `reference_segment_geom` (the line the user/AI calibrated against, nullable).

### 5.3 Takeoff domain

**`Takeoff`** — the working takeoff for a project (typically one active per plan-set version).
`id`, `org_id`, `project_id`, `plan_set_id`, `status` (`DRAFT` | `IN_REVIEW` | `FINAL`), `origin` (`SELF_SERVE` | `MANAGED_SERVICE`), `created_by_user_id`.

**`TradeCategory`** — top-level grouping for organizing conditions (e.g., Concrete, Masonry, Framing, Drywall, Sitework). Seeded from a standard cost-division structure; customizable per org.
`id`, `org_id` (nullable for global seed), `name`, `division_code`, `sort_order`.

**`Condition`** — a named quantity definition within a takeoff.
`id`, `org_id`, `takeoff_id`, `trade_category_id`, `name`, `measurement_type` (`LINEAR` | `AREA` | `COUNT` | `VOLUME` | `SURFACE_AREA`), `unit` (e.g., `LF`, `SF`, `EA`, `CY`, `SY`), `color_hex` (display), `depth_or_height` (nullable double, for deriving volume/surface area from a 2D base), `waste_factor_pct` (default 0), `unit_cost_minor` (nullable, for optional pricing), `notes`, `ai_object_class` (nullable link to the model class this condition maps to).

**`Measurement`** — one geometric object on one sheet, attached to a condition.
`id`, `org_id`, `condition_id`, `sheet_id`, `geom_type` (`POLYLINE` | `POLYGON` | `POINT` | `POINT_GROUP`), `geometry` (spatial geometry in normalized sheet coordinates), `raw_value` (computed length/area/count in real-world units before factors), `source` (`AI` | `MANUAL` | `AI_EDITED`), `ai_confidence` (0–1, nullable), `review_status` (`UNREVIEWED` | `ACCEPTED` | `REJECTED` | `EDITED`), `created_by_user_id` (nullable for AI), `model_run_id` (nullable).

**`QuantityRollup`** — a denormalized, cached quantity per condition (recomputed on measurement change).
`id`, `condition_id`, `base_quantity`, `quantity_with_waste`, `derived_volume` (nullable), `derived_surface_area` (nullable), `extended_cost_minor` (nullable), `measurement_count`, `last_computed_at`.

### 5.4 AI run tracking

**`ModelRun`** — one execution of the AI pipeline over a sheet or plan set.
`id`, `org_id`, `plan_set_id`, `sheet_id` (nullable if set-level), `pipeline_version`, `model_versions` (JSON map of model name → version), `trigger` (`AUTO_ON_UPLOAD` | `USER_REQUESTED` | `REPROCESS`), `status` (`QUEUED` | `RUNNING` | `SUCCEEDED` | `FAILED` | `PARTIAL`), `started_at`, `finished_at`, `candidate_count`, `error_detail` (nullable).

**`DetectionFeedback`** — captures every human acceptance, rejection, or edit of an AI candidate; this is the training signal (see §7.6).
`id`, `org_id`, `measurement_id`, `model_run_id`, `action` (`ACCEPT` | `REJECT` | `EDIT_GEOMETRY` | `RECLASSIFY` | `ADD_MISSED`), `before_geometry` (nullable), `after_geometry` (nullable), `from_class` (nullable), `to_class` (nullable), `actor_user_id`, `actor_role`.

### 5.5 Managed service

**`Order`** — a managed-service request.
`id`, `org_id`, `project_id`, `plan_set_id`, `requested_by_user_id`, `service_tier` (`SINGLE_TRADE` | `FULL_PROJECT` | `RETAINER_DRAW`), `requested_trades` (array of trade category ids), `scope_notes`, `priority` (`STANDARD` | `RUSH`), `promised_turnaround_hours`, `status` (see §11.2), `price_quote_minor`, `assigned_estimator_id` (nullable), `qa_reviewer_id` (nullable), `delivered_takeoff_id` (nullable), `delivered_at` (nullable).

**`OrderEvent`** — immutable audit log of order lifecycle transitions.
`id`, `order_id`, `event_type`, `from_status`, `to_status`, `actor_id`, `actor_role`, `payload` (JSON), `occurred_at`.

### 5.6 Billing & reporting

**`Subscription`** — org's recurring plan (mirrors payment provider).
`id`, `org_id`, `provider_subscription_ref`, `plan_tier`, `seats`, `current_period_end`, `status`.

**`UsageRecord`** — meters billable events (AI takeoff runs, managed orders, exports beyond quota).
`id`, `org_id`, `metric` (`AI_TAKEOFF_RUN` | `MANAGED_ORDER` | `EXPORT`), `quantity`, `occurred_at`, `billed` (bool), `reference_id`.

**`PayoutRecord`** — estimator earnings for fulfilled orders.
`id`, `service_profile_id`, `order_id`, `amount_minor`, `status` (`PENDING` | `PAID` | `REVERSED`), `provider_transfer_ref`.

**`Report`** — a generated export.
`id`, `org_id`, `takeoff_id`, `format` (`PDF` | `XLSX` | `CSV`), `template` (`SUMMARY` | `DETAILED` | `BY_TRADE` | `MARKED_PLANS`), `storage_key`, `generated_by_user_id`, `generated_at`, `status`.

### 5.7 Cross-cutting

**`Notification`** — `id`, `org_id` (nullable for service), `recipient_user_id`, `type`, `payload` (JSON), `channel` (`IN_APP` | `EMAIL` | `WEBHOOK`), `read_at` (nullable), `sent_at`.

**`AuditLog`** — `id`, `org_id` (nullable), `actor_id`, `action`, `resource_type`, `resource_id`, `metadata` (JSON), `ip`, `occurred_at`. Append-only; never updated or deleted.

---

## 6. Functional modules

Each module below lists its responsibilities, the key rules it MUST enforce, and the states it manages. Build order is given in §18.

### 6.1 Accounts, organizations, and access control

Responsibilities: sign-up, login (delegated to the identity provider), organization creation, member invitations, role assignment, seat enforcement, and the permission checks every other module relies on.

Rules:

- A `User` authenticates once; authorization is always evaluated against `(user, organization, role, resource)`. The API MUST reject any request whose target resource's `org_id` does not match an active `Membership` for the caller — except platform/service roles acting on orders explicitly assigned to them.
- Seat limits are enforced at invitation-acceptance time, not invitation-send time. An invitation that would exceed `seat_limit` MUST block acceptance with a clear upgrade prompt.
- Role changes and member removals are audit-logged.
- Support impersonation by `PLATFORM_ADMIN` MUST be explicit, time-boxed, banner-visible to no one but logged in `AuditLog` with a distinct action, and never silent.

Permission matrix (customer side): `OWNER` ⊇ `ADMIN` ⊇ `ESTIMATOR_MEMBER` ⊇ `VIEWER`. Only `OWNER` touches billing. Only `OWNER`/`ADMIN` invite members or delete projects. `VIEWER` can read and export but cannot create or edit measurements.

### 6.2 Project & plan-set management

Responsibilities: create projects, upload plan sets, version plan sets, manage sheets (reorder, rename, set discipline), and present processing status.

Rules:

- Uploading new documents to an existing project creates a **new `PlanSet` version**; prior versions remain immutable and viewable. Takeoffs are bound to a specific plan-set version.
- A plan set is not "ready" until every `SourceFile` reaches `ingest_status = PROCESSED` and tiles exist for every `Sheet`. The UI MUST show per-file and per-sheet progress, not a single opaque spinner.
- Sheet auto-numbering and titling come from extraction (§10.3) but MUST be user-editable; user edits win over re-extraction.
- Deleting a project soft-deletes its plan sets, sheets, takeoffs, and reports; object-storage artifacts are purged by a retention job after a grace window (see §13.5).

### 6.3 Plan viewer & takeoff editor (the core UX surface)

This is the most demanding component. See §8 for rendering internals. Functionally it MUST provide:

- Smooth pan/zoom across very large sheets using the tiled pyramid; no full-image loads.
- A **vector overlay** layer rendering all measurements for the current sheet, color-coded by condition.
- **AI candidate layer** rendered distinctly from accepted measurements (e.g., dashed/translucent), with per-candidate confidence visible on hover and a one-click Accept / Reject / Edit.
- **Manual measurement tools**: linear (polyline with vertex editing), area (polygon with add/remove vertex, including cutouts/holes), count (point placement, with optional "find similar" to auto-place matching symbols), and calibration (two-point scale set).
- **Snapping and assistance**: snap to detected lines/intersections, ortho-lock, and segment length readout while drawing.
- **Condition panel**: list of conditions with live quantities; selecting a condition filters/highlights its measurements; drawing while a condition is active attaches new measurements to it.
- **Sheet navigation**: thumbnail rail, sheet search, and a discipline filter.
- **Undo/redo** across all editing actions, scoped to the session.
- **Multi-user awareness**: if two members open the same takeoff, show presence and live measurement updates (see §6.4).

State the editor manages locally: active sheet, active condition, active tool, selection set, viewport transform, and an optimistic edit buffer that reconciles with server confirmations.

### 6.4 Real-time collaboration & sync

- Measurement create/update/delete operations are persisted through the API and broadcast to other clients viewing the same `takeoff_id` via a real-time channel (WebSocket).
- Conflict policy: measurements are independent objects, so last-write-wins per measurement is acceptable; the `Condition` quantity is always recomputed server-side from the authoritative measurement set, never trusted from the client.
- Presence (who is viewing/editing which sheet) is ephemeral and lives in the cache, not the database.

### 6.5 Conditions, assemblies, and quantity math

- A `Condition` defines a `measurement_type` and `unit`. The system computes `base_quantity` from the geometry in real-world units, then applies `waste_factor_pct` to produce `quantity_with_waste`.
- **Derived quantities**: an `AREA` condition with a `depth_or_height` can derive `VOLUME` (area × height) and `SURFACE_AREA`; a `LINEAR` condition with a height can derive wall `SURFACE_AREA` (length × height). These derivations MUST be explicit on the condition, never silently assumed.
- **Assemblies** (phase 2 capability, modeled now): a named bundle of conditions with ratios (e.g., a "wall assembly" that ties stud LF, drywall SF, and track LF together) so one drawn line populates multiple quantities. The data model supports this via a join from a parent assembly condition to child conditions with multiplier factors.
- All quantity computation is server-authoritative and idempotent. The client displays cached `QuantityRollup` values and shows a "recomputing" state when stale.

### 6.6 Reporting & export

Templates (all driven from the same `Takeoff` data):

- **Summary** — conditions grouped by trade with quantities and optional extended costs.
- **Detailed** — every condition with per-sheet measurement breakdowns.
- **By trade** — one section per `TradeCategory`, suitable for sending to subs.
- **Marked plans** — the original sheets with the measurement overlay burned in, exported as a paginated document.

Rules: exports run as background jobs, are stored in object storage, and are delivered via signed, expiring URLs. Every export is recorded as a `Report` and (if beyond plan quota) meters a `UsageRecord`. Numerical values in exports MUST match `QuantityRollup` exactly — exports never recompute independently.

### 6.7 Notifications

Events that notify: plan-set processing finished, AI takeoff completed, order status changes, order assigned to an estimator, order delivered, member invited, payment failed. Each notification type has a channel policy (in-app always; email for high-signal events; webhook for orgs that configure one). Users control email frequency in preferences.

---

## 7. AI / ML subsystem (automated takeoff)

This is the differentiating capability and the highest technical risk. It is specified as a **pipeline of specialized models** plus a **human-in-the-loop correction loop** that continuously improves them. Targets and tolerances are given so the team can measure success objectively.

### 7.1 What "AI takeoff" must produce

Given a processed `Sheet` with a known scale, the pipeline outputs a set of **candidate measurements**, each with: a geometry (in normalized sheet coordinates), a predicted object class, a real-world quantity, and a confidence score. Candidates are written as `Measurement` rows with `source = AI` and `review_status = UNREVIEWED`, grouped under auto-created or matched `Condition`s.

### 7.2 Pipeline stages

The pipeline runs per sheet, orchestrated as a sequence of background steps. Each stage's output is persisted so any stage can be re-run independently.

1. **Sheet classification** — predict `discipline` and page type (plan / elevation / section / detail / schedule / title). Drives which downstream detectors run. A schedule page, for example, routes to table extraction rather than geometry detection.
2. **Text & symbol OCR** — extract all text with positions: sheet number/title, dimension strings, room names, the scale notation, and legend/keynote text. Feeds scale detection and condition labeling.
3. **Scale detection** — determine `unit_per_pixel` from (a) the printed scale notation, (b) a recognized graphic scale bar, or (c) dimension strings cross-checked against measured distances. Output is a `SheetScale` candidate with confidence; below a threshold it is flagged for mandatory human confirmation before any quantity is trusted.
4. **Line / wall segmentation** — segmentation model identifies linear building elements (walls, partitions, footings, curb lines, pipe runs) and vectorizes them into polylines.
5. **Region / area detection** — detects closed regions (rooms, slabs, roofing planes, paving areas) and vectorizes them into polygons, including interior cutouts.
6. **Symbol / object detection** — object-detection model locates and classifies repeated symbols (doors, fixtures, columns, light fixtures, receptacles, trees) for count conditions.
7. **Vectorization & cleanup** — convert raster predictions to clean vector geometry: snap endpoints, merge collinear segments, close polygons, deduplicate overlapping detections.
8. **Classification → condition mapping** — map each detected object class to a `Condition` (matching an existing condition or creating a new one), and assign the correct `measurement_type` and `unit`.
9. **Quantification** — apply the sheet scale to compute real-world `raw_value` for each candidate.
10. **Confidence assembly** — combine per-stage confidences into a single candidate score used for UI sorting and auto-accept thresholds.

### 7.3 Model families (recommended)

- **Classification** stages use an image classification backbone fine-tuned on labeled sheets.
- **Symbol/object detection** uses a modern object-detection architecture (a real-time detector family or a transformer-based detector) chosen for accuracy on dense, small, repeated symbols.
- **Wall/line and area detection** use semantic/instance segmentation; results are vectorized.
- **OCR** uses a dedicated text-detection + recognition model tuned for engineering drawings (rotated text, thin fonts, dimension notation).

The exact architectures MAY evolve; what MUST stay fixed is the **stage contract** (each stage's input/output shape) so models can be swapped without touching the orchestration.

### 7.4 Inference infrastructure

- Inference runs in the **processing plane** on GPU-backed workers, separate from the application API.
- Work is dispatched per sheet; large plan sets fan out across workers in parallel.
- Models are loaded from a **model registry** by version; the running `pipeline_version` and each `model_version` are recorded on every `ModelRun` for full reproducibility.
- A request path MUST tolerate partial failure: if one stage fails for one sheet, the rest of the set still produces results and the `ModelRun.status` becomes `PARTIAL` with error detail.
- Inference is **asynchronous and idempotent**; re-running a sheet replaces that sheet's prior candidate set under a new `ModelRun`, never duplicating.

### 7.5 Human-in-the-loop review (mandatory)

AI output is **always reviewable**, never silently authoritative:

- Candidates render in a distinct visual layer. The reviewer accepts, rejects, edits geometry, or reclassifies each — or accepts in bulk by condition above a chosen confidence.
- **Auto-accept threshold**: per-class confidence thresholds MAY promote very-high-confidence candidates to `ACCEPTED` automatically, but the system MUST make this visible and reversible, and MUST default conservatively until per-class accuracy is proven in production.
- **Scale gate**: if `SheetScale.confidence` is below threshold or unset, quantities derived from that sheet are shown as provisional and excluded from final reports until a human confirms the scale.
- Every reviewer action writes a `DetectionFeedback` row.

### 7.6 The improvement loop (data flywheel)

1. Every human correction (`DetectionFeedback`) is captured with before/after geometry and class.
2. Corrections are aggregated into a labeled dataset, with provenance and the originating `model_version`.
3. On a regular cadence, models are retrained/fine-tuned on the growing corpus through the offline **training & evaluation pipeline**.
4. New model versions are evaluated against a frozen, held-out benchmark set before any promotion (see §7.7).
5. Promoted models are registered and rolled out behind a version flag; rollback is a version switch, not a redeploy.

Data governance: customer drawings used for training MUST be governed by the terms accepted at sign-up; provide an org-level opt-out and honor it in dataset assembly. Strip or restrict personally or commercially sensitive metadata from training copies.

### 7.7 Accuracy targets, metrics, and tolerances

Define and track these from the first model:

- **Count accuracy** — for count conditions, percent of symbols correctly detected (precision/recall, F1). Initial production target: F1 ≥ 0.90 on common symbol classes.
- **Linear/area quantity error** — absolute percent error of the AI quantity vs. a human-verified quantity per condition. Target: median absolute error ≤ 5% on supported trades, with the scale confirmed.
- **Scale detection accuracy** — percent of sheets where auto-detected scale matches the confirmed scale within tolerance. Target: ≥ 95% on standard architectural sheets.
- **Review burden** — average reviewer edits per accepted measurement; a falling trend indicates the flywheel is working.
- **Coverage** — percent of a plan set's billable quantities the AI proposes without a human adding missed items.

Every model promotion MUST show non-regression on these metrics against the frozen benchmark. Track per-class and per-discipline breakdowns, not just aggregates.

---

## 8. Plan viewer rendering internals

The viewer must feel instant on drawings that are tens of thousands of pixels on a side. The strategy is a **tiled deep-zoom raster pyramid** for the drawing, with a separate **vector layer** for interactive geometry.

### 8.1 Tiled pyramid

- During processing (§10), each sheet is rendered to a pyramid of fixed-size tiles (e.g., 256×256 or 512×512) at multiple zoom levels, each level half the resolution of the one above.
- Tiles are stored in object storage under the sheet's `tile_pyramid_key` and served through the CDN. The client requests only the tiles intersecting the current viewport at the current zoom level.
- A low-resolution thumbnail and an overview level load first for instant first paint; detail tiles stream in as needed.

### 8.2 Vector overlay

- All measurements and AI candidates render in a vector layer aligned to the tile coordinate system via the viewport transform.
- The layer uses Canvas/WebGL for performance with thousands of objects; hit-testing for selection is done against vector geometry, not pixels.
- Geometry is stored and manipulated in **normalized sheet coordinates** (see §9) so it is independent of zoom and screen resolution. Real-world values are derived only through the sheet scale.

### 8.3 Interaction performance budget

- Pan/zoom MUST stay at 60 fps for typical sheets and degrade gracefully (never block) for extreme ones.
- Drawing a measurement MUST reflect on screen in under 16 ms per frame; persistence to the server happens optimistically in the background.
- Switching sheets MUST present the overview tile in under 300 ms on a normal connection.

---

## 9. Coordinate systems, geometry, and units (precision rules)

Getting this layer exactly right is what makes quantities trustworthy.

- **Normalized sheet coordinate space.** Every sheet defines an origin at the top-left and a coordinate space independent of raster DPI (e.g., a fixed virtual resolution per sheet). All `Measurement.geometry` is stored in this space using the database's spatial geometry type, enabling native length/area/intersection math.
- **Scale model.** `SheetScale.unit_per_pixel` converts normalized distance to real-world distance. Linear quantity = geometric length × `unit_per_pixel`. Area quantity = geometric area × `unit_per_pixel²`. The pipeline and the manual tools MUST use the identical conversion.
- **Units.** Each condition carries its own display unit (`LF`, `SF`, `SY`, `CY`, `EA`, etc.). Store the canonical real-world value in a single base unit per dimension (feet for length, square feet for area, cubic feet for volume) and convert for display/export. Never store only the display-converted number.
- **Rounding.** Compute in full precision; round only for display and export, at a configurable precision per unit (default: lengths to 0.1, areas to whole units, counts exact). Quantity rollups store full-precision values.
- **Holes and cutouts.** Polygon areas MUST subtract interior rings (openings, voids). Polyline lengths sum all segments.
- **Validation.** Reject self-intersecting polygons for area conditions; warn on zero-length or degenerate geometry; clamp geometry to sheet bounds.

---

## 10. File ingestion & processing pipeline

### 10.1 Accepted inputs

- Multi-page drawing documents (the common portable drawing format) — the primary input.
- Raster images of drawings (high-resolution scans).
- Vector CAD exchange files (the common 2D drawing-exchange formats) — converted to a web-renderable form; native vector geometry is preserved where available to improve detection.
- Compressed archives containing any of the above (expanded on ingest).

Per-file limits, virus/malware scanning, and MIME validation are enforced at the ingestion boundary. Oversized or unsupported files fail fast with a specific, user-readable error.

### 10.2 Upload mechanics

- Uploads go **directly to object storage** using short-lived signed upload URLs issued by the API — large files never stream through the application servers.
- Resumable/multipart upload MUST be supported for large sets and flaky job-site connections.
- On completion, the client notifies the API, which verifies the checksum and enqueues ingestion.

### 10.3 Processing steps (per source file)

1. **Validate & inventory** — confirm type, scan for malware, count pages.
2. **Page split** — separate each page into a `Sheet` record.
3. **Rasterize** — render each page at a target working DPI suitable for detection.
4. **Tile** — generate the deep-zoom tile pyramid and a thumbnail (§8.1).
5. **Extract** — OCR text and (for vector sources) native geometry; populate `sheet_number`, `sheet_title`, candidate `discipline`.
6. **Index** — write search index entries for the sheet.
7. **Trigger AI** — enqueue the AI pipeline (§7) per sheet when `trigger = AUTO_ON_UPLOAD`.

### 10.4 Status model

`SourceFile.ingest_status`: `PENDING → SCANNING → SPLITTING → RASTERIZING → TILING → EXTRACTING → PROCESSED` (or `FAILED` with `error_detail`).
`PlanSet.processing_status`: `UPLOADING → PROCESSING → READY` (or `PARTIAL` if some files failed). The UI subscribes to these and shows granular progress.

### 10.5 Reliability

- Every step is an idempotent, retriable job with a bounded retry policy and a dead-letter queue for permanent failures.
- Processing is resumable: re-running ingestion for a file skips steps whose outputs already exist (keyed by checksum + step).
- Failures notify the uploader and surface a "retry" affordance; they never leave a plan set silently stuck.

---

## 11. Managed-service marketplace

This adds a fulfillment workflow over the same takeoff tooling.

### 11.1 Order placement

- From a project, a customer places an `Order`: chooses `service_tier`, selects `requested_trades`, sets `priority`, and adds `scope_notes`. The system computes a `price_quote_minor` and `promised_turnaround_hours` from a configurable pricing/turnaround rules table (by tier, trade count, sheet count, priority).
- The customer confirms; payment is authorized (or drawn against a retainer balance). Order enters the queue.

### 11.2 Order lifecycle (status machine)

`DRAFT → QUOTED → PLACED → ASSIGNED → IN_PROGRESS → IN_QA → REVISIONS (optional loop) → DELIVERED → ACCEPTED` with side states `CANCELLED` and `DISPUTED`. Every transition writes an `OrderEvent`. Allowed transitions are enforced server-side; illegal transitions are rejected.

### 11.3 Assignment

- Orders are matched to a `SERVICE_ESTIMATOR` by trade specialty, current capacity, and priority. Assignment MAY be automatic (rules-based) with manual override by `PLATFORM_ADMIN`.
- The assigned estimator fulfills the order using the exact self-serve editor against the customer's plan set, producing a `Takeoff` with `origin = MANAGED_SERVICE`.

### 11.4 QA and delivery

- On completion, the order moves to `IN_QA`; a `SERVICE_QA` reviewer checks the takeoff against a checklist (scale confirmed on every sheet, all requested trades covered, spot-checked quantities, report renders cleanly).
- QA either approves (→ `DELIVERED`) or returns it to the estimator (→ `REVISIONS`).
- Delivery links the finished `Takeoff` to the order, notifies the customer, and unlocks the report exports. The customer can `ACCEPT` or open a `DISPUTE` within a defined window.

### 11.5 Payouts

- On `ACCEPTED` (or auto-accept after the dispute window), a `PayoutRecord` is created for the estimator and settled through the payment provider's payout/transfer mechanism. Disputes pause payouts pending resolution.

### 11.6 SLAs

- `promised_turnaround_hours` is tracked against `placed_at`; approaching/breached SLAs escalate to `PLATFORM_ADMIN` and surface on the ops dashboard. Rush orders carry shorter SLAs and higher price multipliers.

---

## 12. API design

### 12.1 Conventions

- A versioned HTTP/JSON API under a `/v1` prefix for application operations; a real-time channel (WebSocket) for collaboration and live status.
- Resource-oriented paths, plural nouns, standard verbs (GET/POST/PATCH/DELETE). Consistent error envelope with a machine code, human message, and field-level details.
- **Cursor-based pagination** for all list endpoints; never offset pagination on large tables.
- **Idempotency keys** required on all create/charge endpoints to make retries safe.
- Every request is authenticated (bearer token from the identity provider) and authorized against org membership/role. Rate-limited per org and per user.
- All list/read endpoints are org-scoped implicitly by the caller's context; cross-org access is impossible through the public API.

### 12.2 Endpoint groups (representative, not exhaustive)

| Group | Paths (illustrative) | Purpose |
|-------|----------------------|---------|
| Auth/session | `/v1/me`, `/v1/orgs`, `/v1/orgs/{id}/members`, `/v1/invitations` | Identity, org, membership |
| Projects | `/v1/projects`, `/v1/projects/{id}` | Project CRUD and status |
| Plan sets | `/v1/projects/{id}/plan-sets`, `/v1/plan-sets/{id}`, `/v1/plan-sets/{id}/upload-urls` | Versions, signed upload URLs, processing status |
| Sheets | `/v1/plan-sets/{id}/sheets`, `/v1/sheets/{id}`, `/v1/sheets/{id}/scale` | Sheet metadata, scale calibration |
| Takeoffs | `/v1/projects/{id}/takeoffs`, `/v1/takeoffs/{id}` | Takeoff lifecycle |
| Conditions | `/v1/takeoffs/{id}/conditions`, `/v1/conditions/{id}` | Condition CRUD, units, factors |
| Measurements | `/v1/conditions/{id}/measurements`, `/v1/measurements/{id}` | Geometry CRUD; bulk accept/reject |
| AI runs | `/v1/plan-sets/{id}/model-runs`, `/v1/model-runs/{id}` | Trigger and poll AI takeoff |
| Reports | `/v1/takeoffs/{id}/reports`, `/v1/reports/{id}` | Generate/download exports |
| Orders | `/v1/projects/{id}/orders`, `/v1/orders/{id}`, `/v1/orders/{id}/transitions` | Managed-service lifecycle |
| Service ops | `/v1/service/queue`, `/v1/service/orders/{id}/claim` | Estimator/QA fulfillment |
| Billing | `/v1/orgs/{id}/subscription`, `/v1/orgs/{id}/usage`, `/v1/billing/webhooks` | Plans, metering, provider callbacks |
| Notifications | `/v1/notifications`, `/v1/webhooks` | In-app feed, outbound webhooks |

### 12.3 Real-time channel

- Clients subscribe per `takeoff_id` for measurement events and per `plan_set_id` / `model_run_id` for processing and AI-progress events. Server authorizes each subscription against org membership before joining.
- The channel carries deltas only; the authoritative state is always the database, fetched on (re)connect.

---

## 13. Security, privacy, and compliance

### 13.1 Authentication

- Delegate credential handling to an OIDC/OAuth2 identity provider; support email/password, SSO (SAML/OIDC) for larger customers, and MFA. The application never stores raw passwords.
- Short-lived access tokens with refresh; tokens scoped to the user, with org/role resolved server-side per request.

### 13.2 Authorization

- Centralized policy check invoked by every endpoint: `(actor, action, resource)` → allow/deny, with org isolation as the first gate.
- Service-side roles can only act on resources via explicitly assigned orders; they never gain ambient access to customer projects.

### 13.3 Tenant isolation

- Every customer-owned row carries `org_id`; the data-access layer injects an org filter on every query so a missing check fails closed, not open.
- Object-storage keys are namespaced by org; signed URLs are short-lived and scoped to a single object.

### 13.4 Data protection

- TLS in transit everywhere; encryption at rest for the database, object storage, and backups.
- Secrets in a managed secrets store, never in code or images. Rotate regularly.
- PII is minimal (names, emails); drawings may contain sensitive project data and are treated as confidential customer content.

### 13.5 Retention & deletion

- Soft-delete with a configurable grace window, then hard purge of object-storage artifacts via a retention job.
- Provide org-level data export and account deletion to satisfy customer data-rights requests.
- Training-data copies honor the org's training opt-out (§7.6) and the same deletion guarantees.

### 13.6 Auditability

- Append-only `AuditLog` for security-relevant actions: logins, role changes, impersonation, deletions, billing changes, order transitions. Never mutated.

### 13.7 Application security baseline

- Input validation and output encoding on every boundary; parameterized queries only.
- File uploads scanned and type-verified; rendered/derived artifacts never execute.
- Per-org and per-user rate limiting; abuse and anomaly alerts.
- Routine dependency scanning, secret scanning, and periodic third-party penetration testing.

---

## 14. Infrastructure & deployment

- **Cloud:** a single major cloud provider, multi-AZ within one region to start; design for multi-region later.
- **Packaging:** every service ships as a container image built reproducibly in CI.
- **Orchestration:** managed Kubernetes (or a managed container service for a smaller team) with separate node pools for general services and **GPU pools** for inference and training.
- **Networking:** services in private subnets; only the API gateway/load balancer and CDN are public. Database and broker never publicly reachable.
- **Environments:** `dev`, `staging`, `production`, each fully isolated (separate data stores, separate credentials). Production data never flows to lower environments un-anonymized.
- **Infrastructure as code:** all cloud resources defined in version-controlled IaC; no manual console changes in production.
- **Configuration:** environment-specific config and secrets injected at deploy time from the secrets store.

### 14.1 CI/CD

- On every change: lint, type-check, unit tests, build images, run integration tests against ephemeral dependencies, then deploy to `staging` automatically.
- Production deploys are gated (manual approval or protected branch), use rolling or blue-green strategy, and support fast rollback by redeploying the prior image tag.
- Database migrations run as an explicit, versioned, reversible step ordered safely relative to code deploys (expand/contract pattern for breaking changes).

### 14.2 Scaling strategy

- Application API and real-time channel scale horizontally behind the load balancer.
- Processing and inference workers scale on queue depth; GPU workers scale on the AI queue specifically and scale to zero when idle to control cost.
- Database scales vertically first, then via read replicas for read-heavy reporting; partition the largest tables (`Measurement`, `AuditLog`, `UsageRecord`) by time or org as they grow.
- Tiles and exports are served from the CDN, keeping origin load low.

---

## 15. Performance & reliability targets (non-functional requirements)

| Concern | Target |
|---------|--------|
| API read latency (p95) | < 300 ms |
| API write latency (p95) | < 600 ms |
| Viewer first overview paint | < 300 ms on broadband |
| Pan/zoom frame rate | 60 fps typical; never blocking |
| Plan-set processing (per sheet, queued) | first sheets viewable within seconds; full set minutes, scaling with parallelism |
| AI takeoff per sheet | minutes, fanned out across the set |
| Uptime (application plane) | 99.9% monthly |
| Job success rate after retries | > 99.5% |
| Recovery point objective (RPO) | ≤ 5 minutes (point-in-time DB recovery) |
| Recovery time objective (RTO) | ≤ 1 hour |

Backups: automated daily snapshots plus continuous transaction-log archiving for the database; lifecycle-managed object-storage versioning for source files and tiles. Restore drills run on a schedule, not assumed.

---

## 16. Observability

- **Metrics:** request rates/latencies/errors per endpoint; queue depths and job durations per pipeline stage; GPU utilization and inference latency; business metrics (takeoffs run, orders placed, SLA adherence).
- **Logs:** structured, correlated by a request/trace id that flows from the client through every plane.
- **Traces:** distributed tracing across API → queue → workers → inference so a slow takeoff can be diagnosed end to end.
- **Alerting:** on error-rate spikes, queue backlog growth, SLA-breach risk, payment-webhook failures, and model-accuracy regressions detected in production sampling.
- **Dashboards:** an internal ops dashboard for the service team (order queue, SLA timers, estimator capacity) and an engineering dashboard for system health.

---

## 17. Integrations

- **Payments:** subscriptions, usage-based billing, and marketplace payouts through one provider; consume its webhooks as the source of truth for subscription and payment state.
- **Email:** transactional provider for all notifications.
- **Identity/SSO:** OIDC/SAML for enterprise customers.
- **Outbound webhooks:** let customer orgs subscribe to events (takeoff complete, order delivered) for their own tooling.
- **Accounting/estimating export targets (phase 2):** structured exports compatible with common estimating and accounting tools so quantities flow into the customer's existing pricing workflow.
- **Cloud storage import (phase 2):** let customers import plan sets directly from their existing document storage.

---

## 18. Phased delivery roadmap

Each phase is shippable and de-risks the next. AI is present from Phase 1 but its autonomy expands as accuracy is proven.

**Phase 0 — Foundations (weeks 0–4).** Repos, environments, IaC, CI/CD, identity/auth, org/membership/RBAC, base data model, object storage, observability skeleton.

**Phase 1 — Plans in, measure by hand, report out (weeks 4–12).** Upload → ingestion → tiling → viewer with manual measurement tools, scale calibration, conditions, quantity math, and report exports. This is a usable self-serve takeoff product without AI and validates the hardest UX (the viewer) early.

**Phase 2 — AI takeoff with human review (weeks 12–24).** Processing plane, inference service, the staged pipeline (§7.2), candidate layer in the editor, accept/reject/edit, `DetectionFeedback` capture, scale-confidence gating, and accuracy dashboards. Auto-accept stays conservative.

**Phase 3 — Managed-service marketplace (weeks 20–30, overlapping).** Order lifecycle, pricing/turnaround rules, estimator assignment, QA workflow, delivery, payouts, SLAs, and the ops dashboard.

**Phase 4 — Billing, scale, and the flywheel (weeks 28–40).** Subscriptions + usage metering, retainers, the training/evaluation pipeline and model-promotion process, assemblies, and integration exports. Begin widening auto-accept where per-class accuracy clears targets.

**Phase 5 — Hardening & growth.** Multi-region readiness, advanced collaboration, SSO, webhooks, and continued model improvement driven by production feedback.

---

## 19. Team & skills required

- **Frontend engineer(s)** with canvas/WebGL and complex-interaction experience — the viewer/editor is specialist work.
- **Backend engineer(s)** for the application API, data model, and marketplace workflow.
- **ML engineer(s)** for the detection/segmentation/OCR pipeline, training, and evaluation.
- **Data labeling capacity** (in-house estimators or a managed labeling workflow) to build and grow the training corpus — the service team doubles as a labeling and ground-truth source.
- **DevOps/platform engineer** for infra, CI/CD, GPU orchestration, and cost control.
- **Domain expert estimator(s)** to define conditions, units, trade structures, accuracy tolerances, and QA checklists — embedded with the product team, not consulted occasionally.

---

## 20. Key risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| AI accuracy under-delivers early | Erodes trust, increases review burden | Ship manual tooling first (Phase 1); position AI as a reviewed accelerator; gate quantities on confirmed scale; track per-class accuracy openly |
| Scale mis-detection corrupts quantities | Wrong numbers in a bid — worst outcome | Mandatory human scale confirmation below confidence threshold; exclude unconfirmed sheets from final reports |
| Viewer performance on huge drawings | Unusable core surface | Tiled pyramid + vector overlay from day one; strict performance budgets (§8.3) |
| Cold-start training data | Weak initial models | Seed with labeled public/sample drawings; use the managed-service team to generate labeled ground truth from real orders |
| GPU/compute cost | Margin pressure | Scale GPU workers on queue depth, scale to zero when idle, batch inference, cache results |
| Marketplace quality variance | Inconsistent deliverables | Standard QA checklist, estimator specialties, dispute/revision loop, payout tied to acceptance |
| Multi-tenant data leakage | Severe trust/legal failure | Org filter injected at the data layer, fail-closed checks, namespaced storage, audit logging, penetration testing |

---

## 21. Glossary

- **Takeoff** — the itemized quantities (lengths, areas, counts, volumes) extracted from drawings to price a bid.
- **Plan set** — one uploaded version of a project's drawings.
- **Sheet** — a single drawing page.
- **Condition** — a named, trade-specific quantity definition with a measurement type and unit.
- **Measurement** — a single geometric object attached to a condition.
- **Scale calibration** — establishing the real-world distance represented by drawing distance.
- **Candidate** — an AI-proposed measurement awaiting human review.
- **Confidence** — the model's estimated probability that a candidate is correct.
- **Assembly** — a bundle of conditions populated together from shared geometry.
- **Order** — a managed-service request to have a takeoff completed by the service team.
- **Tile pyramid** — multi-resolution raster tiles enabling smooth deep zoom.

---

## 22. Build-readiness checklist

Before writing production code, the team should be able to answer "yes" to each:

- The exact list of supported trades and their conditions/units for launch is defined by the domain expert.
- The seed `TradeCategory` structure and default condition library are written down.
- The pricing and turnaround rules table for managed service is filled in with real numbers.
- The plan tiers, quotas, and usage-metering events are finalized for billing.
- The initial labeling guidelines and the held-out benchmark set for model evaluation exist.
- The accuracy targets in §7.7 are agreed as the bar for expanding AI autonomy.
- Environment, IaC, CI/CD, and observability skeletons are stood up before feature work (Phase 0).

---

*End of specification.*

