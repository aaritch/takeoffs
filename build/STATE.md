# STATE.md — Build Tracker

This is the living state of the build. It is the single place a developer (or coding agent) checks to answer: what is done, what is next, what is blocked, and what decisions have been made. Update it at the end of every working session. If this file and your memory disagree, this file wins.

**Project:** On-Demand Takeoff Platform (hybrid web app, AI auto-takeoff with human review)
**Companion docs:** Takeoff-Platform-Technical-Spec.md, Takeoff-Platform-Project-Plan.md, and the five TASKS-Phase-\*.md files (the per-task implementation details, test scenarios, and caveats).

---

## 1. Current focus

- **Active phase:** Phase 0 — Foundations
- **Active task:** P0-05 — **Next.js app shell DONE** (`apps/web` deploys: landing + `/api/health`; `next build` green). Task stays IN_PROGRESS for the OIDC login flow, which needs the identity provider.
- **Next up:** with the app shell in place, the Phase 1 frontend can begin once auth/data exist — viewer P1-06 (GATE), overlay P1-07, tools P1-09, uploads-client P1-01. These still want the OIDC provider (login) + Neon/Upstash/Blob (data). Or build more UI scaffolding that doesn't need data yet.
- **Open blockers:** see Section 6 — GitHub repo now wired (`origin` → aaritch/takeoffs). Still need Vercel + Neon/Upstash/Blob integrations and an OIDC provider for hosted/auth/CI; P0-10 needs estimator sign-off.
- **Last updated:** 2026-06-19, aarit — **P1-03 (rasterize & tile) DONE.** The ingest pipeline now renders each page and builds a deep-zoom pyramid: **`Rasterizer`** (pdfium wasm for PDFs — cross-platform; sharp for raster images, EXIF-oriented) + **`Tiler`** (sharp → **DZI** pyramid, 256px tiles/overlap 1, PNG, + thumbnail), uploaded under the sheet prefix; records `width_px`/`height_px`/`dpi` + `tile_pyramid_key`/`thumbnail_key`; status RASTERIZING→TILING→PROCESSED. **Tile conventions live in `@takeoff/contracts/tiles`** (so the viewer P1-06 matches) — **working DPI = 150 (provisional, TBD w/ estimator)**. Storage adapter gained `getObject`/`listObjects`. **Integration tests (real pdfium + sharp + MinIO)** verify multi-level pyramids, recorded dims (1275×1650 @150dpi), bounded thumbnails, and image sources; **full suite 76/76 green**. (Rasterize+tile runs when the pipeline is given a rasterizer+tiler — the standalone worker wires them; deferred with §6.)
- **Prior (2026-06-19):** **P1-02 (ingestion) increment 1: the ingest pipeline + queue consumer are built and proven.** `ingestion` module: **`Sheet` model** (migration `0010`, RLS), **pipeline** (confirm→**scan** (pluggable `Scanner`, EICAR stub)→**inventory** (pdf-lib page count)→**split** into ordered Sheet rows), status-per-step, **idempotent** (PROCESSED re-run = no-op), **partial-failure-safe** (a bad file FAILs alone → plan set PARTIAL), uploader **notify** (pluggable `Notifier`). A **Redis consumer** (`drainOne`) drains `INGESTION_QUEUE` under the job's correlation id (verified: id flows enqueue→worker). **Integration tests (real MinIO + Redis + pdf-lib)** cover all 3 card scenarios + partial failure + the producer→consumer loop; **full suite 74/74 green**. **Remaining in P1-02: stand up the standalone `apps/worker-files` deployable** (a loop around `drainOne`) — deferred with the Phase-2 compute-home decision (§6).
- **Prior (2026-06-19):** **P1-01 (uploads) increment 2: the upload mechanism is built, wired, and proven end-to-end.** `source-files` **service** (createPlanSet, createUploadUrls = validate→presign→AWAITING_UPLOAD rows, completeUpload = HEAD→verify size/checksum→UPLOADED+enqueue, or REJECTED persisted) + **repository**; storage adapter gained **`headObject`** + **SHA-256-bound presigned PUTs** (storage rejects corrupted bytes; MinIO round-trip verified); a minimal **Redis enqueue producer** (`platform/queue.ts`, auto-stamps the correlation id); three **`/v1` route handlers** (projects→plan-sets, plan-sets→upload-urls, source-files→complete) behind a shared `apiHandler` (session + `x-org-id` org resolution + ErrorEnvelope mapping). **Integration tests (real MinIO PUT + Redis)** cover all 3 card scenarios; **full web suite 69/69 green** locally (docker up). Route wiring smoke-tested (unauth POST → 401 + correlation header). **Only multipart/resumable upload remains in P1-01** (deferred — see §6).
- **Prior (2026-06-19):** **Phase 1 started: P1-01 (uploads) increment 1.** Built the foundation: **contracts** (`http/uploads.ts` — signed-URL init + complete shapes, `ALLOWED_UPLOAD_TYPES`, `UPLOAD_LIMITS`; `jobs/ingestion.ts` — `IngestionJob`/`INGESTION_QUEUE`; `SourceFileUploadStatus` enum), the **data model** (`plan_sets` + `source_files` tables, migration `0009` with org-RLS via `enable_org_rls`), and the **pure validation core** (`source-files/validation.ts` — type allow-list w/ extension cross-check, per-file + per-set ceilings, completion size/checksum verify; 12 tests). Typecheck/lint/format green; pure tests pass locally. **Next (increment 2): the source-files service (presign + verify-on-complete), `/v1` route handlers, Redis enqueue producer, plan-set creation, and integration tests (run in CI — local docker is down).** Multipart/resumable upload deferred within P1-01 (see blockers).
- **Prior (2026-06-19):** **P0-09 observability DONE.** New edge-safe **`@takeoff/observability`** package (structured JSON logger w/ redaction, correlation-id coerce/mint, log-based metrics; 10 tests). **Correlation-id contract** in `@takeoff/contracts` (`CORRELATION_ID_HEADER` + `Traceable`). Edge middleware now stamps/propagates `x-correlation-id` on every request while preserving auth gating; route handlers use `withRequestContext` (AsyncLocalStorage → request-scoped logger). `instrumentation.ts` = OTEL tracing scaffold (gated on `OTEL_EXPORTER_OTLP_ENDPOINT`). Verified end-to-end on the dev server: id minted/echoed in logs + response header; `?fail=1` → 500 envelope + `event:"error"`/`errors_total`; `/dashboard` still redirects to sign-in. Runbook `docs/runbooks/observability.md`. **Phase 0 now 9/10** — only P0-10 (estimator sign-off) left. Dashboard/error-rate alert is a manual Vercel config (documented). **Note:** local docker stack was down (Docker Desktop off), so DB integration tests ran in CI, not locally; the new observability tests are pure and pass locally.
- **Prior (2026-06-19):** **P0-08 CI/CD DONE.** GitHub Actions `ci.yml` **green** (run 27810723824: lint/format/typecheck/test against ephemeral Postgres+PostGIS/Redis/MinIO/build). Fixed a stale lockfile (`@vercel/blob` left in `pnpm-lock.yaml` → `--frozen-lockfile` failed; regenerated). Vercel git integration confirmed working (push `main` → production READY). Added `db-migrate.yml` (manual, env-gated). Phase 0 now 8/10. **Remaining Phase 0: P0-09 observability; P0-10 awaits estimator sign-off.** Optional hardening: branch protection on `main` + a `DATABASE_URL` repo secret for the migrate workflow.
- **Prior (2026-06-19):** **DEPLOYED TO VERCEL PRODUCTION — full stack confirmed live.** `https://takeoffs-aaritchs-projects.vercel.app`: `/api/health` → all 5 integrations `true` (db, appDb, redis, storage, auth); landing 200; OIDC sign-in 302s to Entra with the prod redirect_uri/PKCE/scope. Fixed Vercel project settings to make it build: **rootDirectory=`apps/web`, framework=`nextjs`** (was empty → "no public dir" error), and **deployment protection → preview-only** (was protecting prod too). Deployed via `vercel deploy --prod` (project is **not** git-connected yet — that's a P0-08 item). Only manual step left: a human browser login to confirm JIT user provisioning.
- **Prior (2026-06-17):** **All Phase-0 hosted integrations LIVE: Neon + Upstash + R2 + OIDC.** OIDC done via **Microsoft Entra ID** (Azure CLI): single-tenant app registration "Takeoff Platform" (client `5b340884…`, tenant `864774d8…`) with local+prod redirect URIs, `email`/`preferred_username` optional id-token claims, client secret minted; `AUTH_*` wired into `.env.local` + Vercel (all envs; `AUTH_URL` prod-only). **Login flow verified end-to-end** (dev server: `/api/health` → auth:true; sign-in 302s to Entra authorize with correct client_id, redirect_uri, PKCE, scope=openid profile email) — only a human browser login remains to confirm JIT provisioning. Neon/Upstash/R2 all provisioned + verified earlier today. **Next: P0-08 CI/CD, then first hosted deploy; or resume Phase-1 frontend.**

> Keep this section to a few lines. It is the first thing the next person reads. The detail lives in the task registry below.

---

## 2. How to work, task by task

Repeat this loop for every task. Do not skip the test step, and never cross a GATE without its tests passing.

1. **Pick the next task.** Choose the lowest-numbered task whose status is NOT_STARTED and whose dependencies are all DONE. The registry (Section 4) lists dependencies for each.
2. **Read its card.** Open the matching TASKS-Phase file and read that task's Implementation details, Test scenarios, and Caveats in full before writing anything.
3. **Set status to IN_PROGRESS.** Update the registry row and the Current focus section. Add your name and date.
4. **Write the tests first where practical.** The test scenarios are already enumerated for you; turn them into real tests.
5. **Implement to the contract.** Keep every cross-boundary shape in the shared contracts package. Honor the caveats.
6. **Run the tests.** All listed scenarios, including the failure and edge cases, must pass.
7. **Self-review against the caveats.** Confirm you did not fall into any trap the task warned about.
8. **Set status to DONE** (or IN_REVIEW if someone else must approve). Note anything future tasks should know in Section 7.
9. **If you got blocked,** set status to BLOCKED, record the blocker in Section 6, and pick a different unblocked task if one exists.
10. **Update Section 1 and the phase progress counters** before you stop for the session.

---

## 3. Status legend and conventions

Use exactly these status values in the registry:

- **NOT_STARTED** — no work begun.
- **IN_PROGRESS** — actively being built by the named owner.
- **BLOCKED** — cannot proceed; the reason is logged in Section 6.
- **IN_REVIEW** — built and self-tested, awaiting review or sign-off.
- **DONE** — built, all test scenarios pass, caveats checked, dependents may proceed.

Other conventions:

- **GATE** tasks block the start of the next phase. A phase is not finished until all its tasks are DONE and its gate tasks have passing tests.
- A task may only move to IN_PROGRESS when every dependency is DONE. If you need to start earlier, record the risk in Section 6 first.
- Owner is the single person accountable for the task right now. One owner at a time.
- When you change a status, also update the phase counter at the top of that phase's table.

---

## 4. Task registry

Columns: ID | Task | Depends on | Gate | Owner | Status. Update Owner and Status as you work. Keep Task and Depends-on as written so cross-references stay valid.

### Phase 0 — Foundations  (progress: 9/10 DONE)

| ID | Task | Depends on | Gate | Owner | Status |
|----|------|-----------|------|-------|--------|
| P0-01 | Monorepo and workspace tooling | none | no | aarit | DONE |
| P0-02 | Contracts package skeleton | P0-01 | no | aarit | DONE |
| P0-03 | Core enumerations | P0-02 | no | aarit | DONE |
| P0-04 | Infrastructure for the dev environment | P0-01 | no | aarit | DONE |
| P0-05 | Identity provider and login flow | P0-04 | no | aarit | DONE |
| P0-06 | Accounts module: orgs, memberships, RBAC | P0-05, P0-03 | no | aarit | DONE |
| P0-07 | Org-isolation data-access layer | P0-06 | YES | aarit | DONE |
| P0-08 | CI/CD pipeline | P0-01, P0-04 | no | aarit | DONE |
| P0-09 | Observability skeleton | P0-08 | no | aarit | DONE |
| P0-10 | Seed trade structure and starter conditions | P0-03 | YES | aarit | IN_REVIEW |

### Phase 1 — Manual Takeoff  (progress: 3/14 DONE)

| ID | Task | Depends on | Gate | Owner | Status |
|----|------|-----------|------|-------|--------|
| P1-01 | Direct-to-storage uploads | P0-04, P0-07 | no | aarit | IN_PROGRESS |
| P1-02 | Ingestion: validate, scan, split | P1-01 | no | aarit | IN_PROGRESS |
| P1-03 | Rasterize and tile | P1-02 | no | aarit | DONE |
| P1-04 | Extraction and sheet metadata | P1-03 | no | - | NOT_STARTED |
| P1-05 | Processing status model and progress UI | P1-02 | no | - | NOT_STARTED |
| P1-06 | Tiled viewer canvas | P1-03 | YES | - | NOT_STARTED |
| P1-07 | Vector overlay and selection | P1-06 | no | - | NOT_STARTED |
| P1-08 | Scale calibration and geometry package | P1-07 | no | aarit | IN_PROGRESS |
| P1-09 | Manual measurement tools | P1-08 | no | - | NOT_STARTED |
| P1-10 | Conditions, units, and factors | P0-10, P1-08 | no | aarit | DONE |
| P1-11 | Server-authoritative quantity rollups | P1-09, P1-10 | YES | aarit | DONE |
| P1-12 | Undo/redo | P1-09 | no | - | NOT_STARTED |
| P1-13 | Reports and exports | P1-11 | no | - | NOT_STARTED |
| P1-14 | Export-vs-rollup parity | P1-13 | YES | - | NOT_STARTED |

### Phase 2 — AI Takeoff with Human Review  (progress: 0/12 DONE)

| ID | Task | Depends on | Gate | Owner | Status |
|----|------|-----------|------|-------|--------|
| P2-01 | Stage contracts mirrored across planes | P0-02 | no | - | NOT_STARTED |
| P2-02 | GPU worker pool and inference skeleton | P0-04 | no | - | NOT_STARTED |
| P2-03 | Pipeline orchestration with partial failure | P2-01, P2-02 | no | - | NOT_STARTED |
| P2-04 | Stages: classification, OCR, scale detection | P2-03 | no | - | NOT_STARTED |
| P2-05 | Scale-confidence gate | P2-04 | YES | - | NOT_STARTED |
| P2-06 | Stages: line/wall and area detection | P2-03 | no | - | NOT_STARTED |
| P2-07 | Stage: symbol/object detection for counts | P2-03 | no | - | NOT_STARTED |
| P2-08 | Vectorization, mapping, quantification, confidence | P2-06, P2-07, P1-08 | no | - | NOT_STARTED |
| P2-09 | Candidate layer in the editor | P1-07 | no | - | NOT_STARTED |
| P2-10 | Review actions and bulk accept | P2-09, P1-11 | no | - | NOT_STARTED |
| P2-11 | Feedback capture | P2-10 | YES | - | NOT_STARTED |
| P2-12 | Accuracy dashboard | P2-11 | no | - | NOT_STARTED |

### Phase 3 — Managed-Service Marketplace  (progress: 0/9 DONE)

| ID | Task | Depends on | Gate | Owner | Status |
|----|------|-----------|------|-------|--------|
| P3-01 | Order model and state machine | P0-03, P0-06 | no | - | NOT_STARTED |
| P3-02 | Pricing and turnaround rules | P3-01 | no | - | NOT_STARTED |
| P3-03 | Order placement flow | P3-02, P1-01 | no | - | NOT_STARTED |
| P3-04 | Estimator assignment and capacity | P3-01 | no | - | NOT_STARTED |
| P3-05 | Fulfillment in the shared editor | P3-04, P1-09, P2-10 | no | - | NOT_STARTED |
| P3-06 | QA workflow | P3-05 | YES | - | NOT_STARTED |
| P3-07 | Delivery, acceptance, and dispute | P3-06 | no | - | NOT_STARTED |
| P3-08 | Internal ops dashboard | P3-04 | no | - | NOT_STARTED |
| P3-09 | Order audit trail | P3-01 | no | - | NOT_STARTED |

### Phase 4 — Billing, Scale, and the Flywheel  (progress: 0/8 DONE)

| ID | Task | Depends on | Gate | Owner | Status |
|----|------|-----------|------|-------|--------|
| P4-01 | Subscriptions and seats | P0-06 | no | - | NOT_STARTED |
| P4-02 | Usage metering and quotas | P2-03, P1-13 | no | - | NOT_STARTED |
| P4-03 | Retainers and draw-down | P3-03 | no | - | NOT_STARTED |
| P4-04 | Estimator payouts | P3-07 | YES | - | NOT_STARTED |
| P4-05 | Training and evaluation pipeline | P2-11 | YES | - | NOT_STARTED |
| P4-06 | Model promotion and rollback | P4-05, P2-02 | YES | - | NOT_STARTED |
| P4-07 | Assemblies | P1-10 | no | - | NOT_STARTED |
| P4-08 | Integration exports | P1-13 | no | - | NOT_STARTED |

### Phase 5 — Hardening and Growth  (progress: 0/6 DONE)

| ID | Task | Depends on | Gate | Owner | Status |
|----|------|-----------|------|-------|--------|
| P5-01 | Multi-region readiness and DR drills | none | no | - | NOT_STARTED |
| P5-02 | SSO and MFA for enterprise | P0-05 | no | - | NOT_STARTED |
| P5-03 | Outbound webhooks | P0-09 | no | - | NOT_STARTED |
| P5-04 | Advanced collaboration | P1-07 | no | - | NOT_STARTED |
| P5-05 | Cloud-storage import | none | no | - | NOT_STARTED |
| P5-06 | Security review and penetration test | P0-07 | no | - | NOT_STARTED |

**Totals:** 59 tasks. 11 DONE / 1 IN_PROGRESS / 1 IN_REVIEW / 0 BLOCKED / 46 NOT_STARTED. Update these counts as you go.

---

## 5. Gate checklist

A gate must have passing tests before the phase it belongs to is considered finished and the next phase begins. Mark each PASS only when its task is DONE and verified.

- [x] P0-07 — Org isolation proven fail-closed at the data layer (RLS + non-superuser role + withOrgScope). Proven on projects & memberships; the guard test forces RLS on every future org_id table as Phase 1 entities land. (Signed-URL scoping/expiry → P1-01.)
- [~] P0-10 — Seed trades & starter conditions exist, load idempotently, and are visible to new orgs (tested; unit↔type validated). **Awaiting domain-estimator sign-off** on the trade list & units (provisional catalog in `apps/web/server/modules/trades/seed-data.ts`).
- [ ] P1-06 — Viewer meets the performance budget on representative hardware
- [x] P1-11 — Quantity rollups are server-authoritative and tamper-proof (server core: client submits geometry only, server computes raw_value + recomputes rollup from the full set; add/edit/delete + convergence tested). Client "recomputing" indicator + debounce are frontend (P1-09).
- [ ] P1-14 — Exports match rollups exactly
- [ ] P2-05 — Unconfirmed-scale sheets excluded from final reports
- [ ] P2-11 — Every AI correction captured as feedback
- [ ] P3-06 — QA checklist gates delivery
- [ ] P4-04 — Payouts only on acceptance or auto-accept
- [ ] P4-05 — Training data respects opt-outs; benchmark frozen
- [ ] P4-06 — Model promotion blocks regressions; rollback works

---

## 6. Blockers log

Record anything stopping progress. Remove or mark resolved when cleared. Keep newest at the top.

| Date | Task | Blocker | Needs | Owner | Status |
|------|------|---------|-------|-------|--------|
| 2026-06-19 | P1-02 | **Standalone `apps/worker-files` deployable deferred.** The ingestion pipeline + queue consumer (`drainOne`) live in `apps/web/server/modules/ingestion` (reusing the data/storage/org-scope layers) and are fully tested; the separate long-running worker process is a thin loop around `drainOne`. | Build `apps/worker-files` (loop + lifecycle + Docker) when the Phase-2 compute home is chosen; likely extract the data+storage layers into packages then so the worker imports them cleanly instead of from `apps/web`. Also: multi-file plan sets currently order pages by (source_file_id, index_in_set) — a global cross-file ordinal is a later refinement. Pipeline marks PROCESSED after split (raster/tile/extract P1-03/04 will insert steps before PROCESSED). | aarit | ACCEPTED |
| 2026-06-19 | P1-01 | **Multipart/resumable upload deferred** to a later P1-01 increment; increment 1 ships the contracts + data model + validation core, and the planned increment 2 does single-PUT presigned uploads + verify-on-complete + enqueue. Resumability (S3 multipart: create → presigned parts → complete/abort) is the harder sub-part — consistent with the repo pattern of shipping a tested core first (cf. P1-08/P1-11). | Increment 2 (service/routes/enqueue), then multipart. Decide per-part size + client resume protocol. | aarit | ACCEPTED |
| 2026-06-19 | P1-01 | Increment-1 **integration tests run in CI, not locally** — Docker Desktop is off, so the DB/MinIO-backed tests (incl. the org-RLS guard over the new `plan_sets`/`source_files` tables) can't run on this machine. Pure unit tests (validation, contracts) pass locally. | Start Docker Desktop for local integration runs, or rely on the green CI pipeline. | aarit | ACCEPTED |
| 2026-06-14 | P1-11 | Measurement geometry stored as **JSONB** (normalized coords) for now; quantities computed via the pure `@takeoff/geometry` package, not PostGIS `ST_*` | The single conversion path is the geometry package (spec §9 / "every quantity flows through it"); drizzle's PostGIS polygon support is weak. **PostGIS geometry columns + spatial math (ST_Length/Area/intersects) are deferred** to when spatial ops are needed (snapping/overlap, P1-07/P2). PostGIS requirement (P0-04) still stands for that. | P1-11, P1-07, P2-06/07 |
| 2026-06-14 | P1-11 (early start) | Building the rollup SERVER core before P1-09 (drawing tools, frontend) | Risk accepted: rollups are computed from the authoritative measurement set; that set can be created with synthetic measurements (as the tools will) and tested headlessly. The tools UI is a separate frontend task. | aarit | ACCEPTED |
| 2026-06-14 | P1-10 | Added a **minimal `takeoffs` table** (spec §5.3) to anchor conditions; full takeoff lifecycle is a later task. Per-condition quantity math (waste/derived/extended-cost) lives in `conditions/quantities.ts` (pure, on @takeoff/geometry); the persisted rollup over a measurement set is P1-11. `plan_set_id` on takeoffs is nullable until plan sets exist. | P1-10; P1-11 (rollups), takeoff lifecycle |
| 2026-06-14 | P1-08 | Built the pure `@takeoff/geometry` package ahead of its registry deps (P1-07 viewer) and the P0-10 gate | Risk accepted: geometry/scale/quantity math is pure, UI-free, the foundation P1-09/P1-11 depend on. Package DONE & tested (25 tests incl. metric/imperial calibration, holes, self-intersection, e2e calibrate→quantity). The two-point scale-calibration UI part of P1-08 still waits for the viewer (P1-06/07). | aarit | DONE (pkg) |
| 2026-06-13 | P0-06 | Started before its dependency P0-05 (identity provider) is DONE | Risk accepted: build accounts domain + RBAC against local Postgres; the authenticated-user identity is abstracted behind an `AuthContext` resolver so P0-05's OIDC/JIT-provisioning plugs in without rework. No live auth needed to build/test the domain. | aarit | ACCEPTED |
| 2026-06-15 | (resolved) | All Phase-0 cloud integrations now provisioned | ~~GitHub~~, ~~app shell~~, ~~integration wiring~~, ~~R2~~, ~~Neon~~, ~~Upstash~~, ~~OIDC (Entra ID)~~ — all DONE & verified; `AUTH_*` + data env set in Vercel (Prod/Preview/Dev). Hosted app is deployable. Remaining cloud item is a P0-08 concern (CI deploy gating), not a blocker. | aarit | RESOLVED 2026-06-17 |
| - | - | local development is unblocked (docker-compose stack works) | - | - | - |

---

## 7. Decision log

Record decisions that future tasks depend on, especially the ones with no single right answer. This prevents re-litigating settled choices and explains why something is the way it is. Newest at the top. Mirror significant entries into a proper ADR file under docs/adr.

| Date | Decision | Context / rationale | Affects |
|------|----------|---------------------|---------|
| 2026-06-13 | Org isolation: **Postgres RLS** (FORCE) keyed on a per-tx `app.current_org_id`, set via `withOrgScope`; tenant access uses a **non-superuser role** (`takeoff_app` locally) so RLS bites; admin/identity uses the superuser conn. `enable_org_rls(table)` applied per customer-owned table; an introspection **guard test** fails the build if any org_id table lacks RLS. Storage keys namespaced `org/{id}/…`. | P0-07 GATE; P1-* (every customer-owned table must call enable_org_rls); signed-URL scoping → P1-01 |
| 2026-06-13 | Data layer: **Drizzle ORM + drizzle-kit** (Postgres). RBAC lives in **`@takeoff/auth`**; accounts domain + data layer live in **`apps/web/server`** (framework-agnostic; Next.js wiring added in P0-05) | P0-06. Drizzle chosen over Prisma for first-class PostGIS/custom-type support and Neon-serverless fit. `pg` driver locally; Neon serverless driver added for Vercel later. App code already lands in its final home (`apps/web/server`) so P0-05 only adds Next routes/auth, not a move. | P0-06, P0-07, P1-* (every entity, migrations) |
| 2026-06-19 | Rasterize/tile (P1-03): **pdfium (wasm)** renders PDFs, **sharp** tiles to **DZI** (256px/overlap 1, PNG) + thumbnail; **working DPI = 150 (provisional)** | pdfium-wasm is host-agnostic (no native poppler/ghostscript binary) so it runs on Vercel-adjacent + the Phase-2 worker host alike; sharp's `.tile()` is battle-tested DZI. DZI is the OpenSeadragon-style standard the viewer (P1-06) will consume — conventions are pinned in `@takeoff/contracts/tiles` so producer/consumer can't drift. **150 DPI is a provisional default for the "working raster DPI" TBD** (STATE §7) — revisit with the estimator (too low hurts detection, too high explodes storage). PNG tiles (not JPEG) to avoid artifacts on line art. Caveat to verify at P1-06: pdfium's 4-channel bitmap is fed to sharp as-is; if real PDFs show swapped colors, add a BGRA→RGBA swap. | P1-03, P1-06 (viewer), P2 (detection DPI) |
| 2026-06-19 | Uploads data model (P1-01): **`org_id` denormalized** onto `plan_sets` and `source_files`; `byte_size` is **bigint**; type allow-list cross-checks **extension + MIME**; completion verifies **size always, checksum when storage computed it** | Spec §5.2 reaches SourceFile via plan_set → org, but our RLS keys on a per-row `org_id` column (P0-07), so every customer-owned table carries `org_id` for uniform fail-closed isolation. bigint avoids overflow on large CAD sets. Never trust the client's content-type alone (spec §10.2): a `.exe` labelled `application/pdf` is rejected at the boundary; magic-byte sniffing is deferred to ingestion (P1-02). Verify-on-complete HEADs the object for real size (+ S3 SHA-256 where available). Launch ceilings: 500 MiB/file, 200 files/set, 2 GiB/set (provisional). | P1-01, P1-02 (ingestion), P1-03 (sheets) |
| 2026-06-19 | Observability (P0-09): **structured JSON logs + a correlation id**, in a shared edge-safe **`@takeoff/observability`** package; contract (`CORRELATION_ID_HEADER`/`Traceable`) in `@takeoff/contracts` | The correlation-id contract must exist before Phase 1 spreads across services (the P0-09 caveat). Package is edge-safe (no `node:async_hooks`) so middleware AND future workers share it; the Node-only `AsyncLocalStorage` request context lives in `apps/web/server/platform`, not the package. Metrics are **log-based events** (`event:"metric"`/`"error"`) because serverless has no shared counters — Vercel/log-drain aggregates them. Tracing is a **scaffold** (`instrumentation.ts`) gated on `OTEL_EXPORTER_OTLP_ENDPOINT`; full OTEL wiring deferred until the Phase-2 second compute home exists. Dashboard + error-rate alert are manual Vercel config. | P0-09, P1+ (all services log under the contract), P2 (tracing) |
| 2026-06-19 | CI/CD (P0-08): **GitHub Actions** for lint/format/typecheck/test/build + **Vercel Git integration** for deploy | Matches the Vercel hosting model (CLAUDE.md §6): Actions runs `.github/workflows/ci.yml` on push/PR to main against ephemeral service containers (Postgres+PostGIS, Redis) + a MinIO container, reusing `db:bootstrap` to mirror the local stack. Deploy is Vercel's git integration (push to `main` → production; PRs → preview). Migrations are a **separate manual workflow** (`db-migrate.yml`, `workflow_dispatch`, `production` environment) using a `DATABASE_URL` repo secret — never in the build path. **Prod gating = GitHub branch protection** requiring the CI check on `main` (recommended; not auto-enabled to avoid breaking solo direct-push — `gh` not installed). | P0-08, P0-09 (obs), every future PR |
| 2026-06-17 | OIDC identity provider: **Microsoft Entra ID** (single-tenant app registration "Takeoff Platform") | User is on Azure; Entra is a standards-compliant OIDC provider that works with our generic Auth.js `oidc` provider (issuer = `https://login.microsoftonline.com/<tenant>/v2.0`, discovery issuer matches exactly). Set up via **Azure CLI** (`az ad app create` + `credential reset`), not browser. Single-tenant (`AzureADMyOrg`) = only the Default Directory's users sign in — fine for setup/managed-service; switch to `AzureADMultipleOrgs` if external contractors with their own MS orgs must log in. Added `email`+`preferred_username` optional id-token claims because Entra omits `email` by default and our JIT provisioning needs it. Tenant is a **personal-account Default Directory** (`864774d8…`) — revisit if a work tenant becomes preferred. | P0-05, P5-02 (SSO/MFA), all authed routes |
| 2026-06-17 | Hosted data layer provisioned via **Vercel Marketplace**: **Neon Postgres** (Postgres 17 + PostGIS 3.5) and **Upstash for Redis**, both connected to the `takeoffs` project | `vercel integration add neon` / `upstash/upstash-kv` auto-creates the resources, injects env across all envs, and pulls to `.env.local`. Neon owner (`neondb_owner`) has `rolbypassrls=true`, so a separate **`takeoff_app`** (NOSUPERUSER NOBYPASSRLS) role is the tenant connection (`APP_DATABASE_URL`); `db:bootstrap` automates PostGIS + role + grants idempotently (note: re-runs must not re-assert NOSUPERUSER/NOBYPASSRLS — Neon rejects attribute changes by non-superusers). Org-isolation proven on live Neon via `db:verify-role`. | P0-04 (hosted), P0-05, P1-* (all hosted data) |
| 2026-06-15 | Object storage (prod): **Cloudflare R2** | User is on Azure, but Azure Blob is NOT S3-compatible; R2 is genuinely S3-compatible so the existing `S3Storage` adapter works unchanged (endpoint = `https://<acct>.r2.cloudflarestorage.com`, region `auto`, path-style). MinIO stays the local stand-in. No code change — config only; see `docs/runbooks/integrations-setup.md` §4. | P1-01 (uploads), storage env |
| 2026-06-15 | Integrations wired (P0-05 + infra): **Auth.js v5 generic OIDC** (JIT user provisioning, JWT session, edge middleware gating the `(app)` routes; disabled when `AUTH_ISSUER_URL` unset), **ioredis** Redis client, and an **S3-compatible storage adapter** (presigned upload/download, tested vs local MinIO). **Storage choice changed: Vercel Blob → S3-compatible** (R2/S3/MinIO) — matches the spec's presigned-upload model + local parity; supersedes the 2026-06-13 Blob decision. Account setup pending — see `docs/runbooks/integrations-setup.md`. | P0-05, P1-01 (uploads), all data/auth |
| 2026-06-15 | Design system: **`@takeoff/ui`** (source-consumed React) — tokens (TS + mirrored CSS vars), `cn`, primitives (Button/Card/Badge/Stack), one shipped `styles.css` (imported once at the app root). Component tests run under **jsdom** via Vitest (`@testing-library/react`). | Foundational (not a numbered task); supports all Phase 1 frontend. Viewer primitives join here at P1-06/07. |
| 2026-06-15 | App shell: **Next.js 15 (App Router) + React 19** in `apps/web`; workspace packages via `transpilePackages`; `pg` kept external; ESLint-at-build off (repo ESLint covers it); `next-env.d.ts` gitignored (generated) | P0-05 app-shell. `apps/web` flips from a source-only TS package to a Next app; `build` is now `next build`, `typecheck` stays `tsc --noEmit`. Server domain (`server/`) unchanged, imported by future route handlers. | P0-05 (auth), all Phase 1 frontend |
| 2026-06-13 | Local dev stack: **docker-compose** with `postgis/postgis:16-3.4`, `redis:7`, **MinIO** (S3-compatible) standing in for Vercel Blob | P0-04 (local portion). Mirrors the hosted data layer so app/workers run end-to-end without cloud accounts; storage adapter makes MinIO↔Blob a config swap. Run via `pnpm dev:up`/`dev:down`/`dev:reset`. PostGIS verified (spatial column create/insert/drop; reset+up repeatable). | P0-05+, P1-* (data layer, geometry) |
| 2026-06-13 | Contract validation: **Zod**; internal packages are **source-consumed** (exports → `src/index.ts`, no emit); tests via **Vitest** | P0-02. Zod gives runtime validation + inferred static types from one definition. Source consumption (Next.js transpiles; workers built with tsup/tsx) avoids the ESM-extension footgun — `build`/`typecheck` = `tsc --noEmit`. Source packages add a local `turbo.json` (`"extends": ["//"]`, empty `outputs`) to silence Turbo's no-output warnings. | P0-03+ (all contract shapes); every TS package |
| 2026-06-13 | Workspace tooling: **pnpm 9 workspaces + Turborepo 2**; ESLint 9 flat config + Prettier 3; internal scope `@takeoff/*` | P0-01. Canonical Vercel monorepo. Cross-package deep imports blocked by ESLint `no-restricted-imports` now. **Gotcha:** `corepack enable` fails on this Windows box (EPERM writing to `C:\Program Files\nodejs`) — pnpm was installed via `npm i -g pnpm@9.15.4` into the user prefix instead. Use that, not corepack, here. | P0-02+ (all TS packages/apps) |
| 2026-06-13 | Hosting: app plane on **Vercel**, source of truth on **GitHub** | Product is hosted on Vercel; GitHub drives deploys (Vercel git integration) + GitHub Actions for CI. Vercel cannot run GPU/long workers/persistent WebSockets, so hosting is split by plane. | P0-01, P0-04, P0-08, all app-plane tasks |
| 2026-06-13 | Frontend + app API: **Next.js (App Router)** full-stack on Vercel | Vercel-native; collapses the spec's Vite SPA + standalone NestJS into one app. Domain logic kept framework-agnostic under `apps/web/server` so it stays portable. Drop `sdk-client`. | P0-01, P0-02, P1-*, all API modules |
| 2026-06-13 | Data stores: **Neon Postgres + PostGIS**, **Upstash Redis**, **Vercel Blob** | Vercel Marketplace integrations; Neon supports the required spatial extension. Least ops, tightest Vercel fit. | P0-04, P1-01, P1-08, geometry/measurements |
| 2026-06-13 | Processing/AI/realtime compute home: **TBD at Phase 2** | Phases 0–1 run on Vercel + Neon + Upstash + Blob. GPU inference, long workers, and the WebSocket gateway need a second host (serverless GPU like Modal/Replicate, or a container host like Render/Fly/AWS) — decide when AI lands. | P2-02, P2-*, P1-02..P1-04 (workers), realtime |
| - | Working raster DPI for sheets: **provisional 150** (in `@takeoff/contracts/tiles` `WORKING_DPI`), pending estimator sign-off | Too low harms AI accuracy; too high inflates storage and processing. 150 chosen as a balanced default to unblock P1-03; not yet estimator-approved. | P1-03, P2-04, P2-06, P2-07 |
| - | Self-intersecting polygon policy: TBD (reject or auto-correct) | Areas must never be ambiguous | P1-09, geometry package |
| 2026-06-13 | Launch trade list & condition units: **provisional catalog in place** (6 trades / 14 conditions, `seed-data.ts`), unit↔type machine-validated — but NOT yet domain-estimator-approved | Wrong units corrupt every quantity downstream; the catalog is an engineering placeholder pending sign-off (P0-10 GATE held in IN_REVIEW until then) | P0-10, P1-10 |
| - | Auto-accept confidence thresholds per class: start conservative | Trust depends on not auto-accepting wrong candidates | P2-10, P4-06 |
| - | Dispute and auto-accept windows for orders: TBD | Must be explicit and customer-visible | P3-07, P4-04 |

> Replace each TBD with the chosen value and the date once decided. Do not start a dependent task on a TBD without logging the assumption you are proceeding under.

---

## 8. Environment and setup state

Track whether the shared scaffolding actually works, separate from feature progress. A coder resuming cold needs to know what is already standing.

- [x] Repository cloned and builds from clean checkout (P0-01) — `pnpm install && pnpm build` green; lint/format gates verified
- [x] Git remote configured — `origin` = https://github.com/aaritch/takeoffs.git; `main` tracks `origin/main` (all commits pushed). Future commits push with plain `git push`.
- [x] Contracts package importable across workspaces (P0-02) — `@takeoff/contracts` (Zod); cross-workspace type resolution verified
- [~] Dev environment (P0-04): **local** docker-compose stack up & PostGIS spatial column verified; **hosted** now LIVE — **Neon Postgres** (PostGIS, `takeoff_app` RLS role, migrated+seeded, org-isolation proven on the live DB), **Upstash Redis** (round-trip OK), **Cloudflare R2** (round-trip OK). All env vars (`DATABASE_URL`, `APP_DATABASE_URL`, `REDIS_URL`, `S3_*`) set in Vercel across Prod/Preview/Dev and pulled to `.env.local`. **Note:** `.env.local` (vercel pull) points local `pnpm dev` at HOSTED services and overrides `.env` — rename/remove it to develop against the local docker stack. Only OIDC provisioning still pending.
- [x] Next.js app shell + **Auth.js OIDC LIVE** (P0-05): JIT provisioning, JWT session, middleware route-gating, sign-in/out UI — wired to **Microsoft Entra ID** (single-tenant app reg). Verified: sign-in 302s to Entra authorize with correct client_id/redirect_uri/PKCE/scope; `/api/health` auth:true. Redis + S3 also live. (Final human confirmation: complete one browser login.)
- [~] Hosted deploy: **app is LIVE on Vercel production** (`takeoffs-aaritchs-projects.vercel.app`), deployed manually via `vercel deploy --prod`. Project settings: rootDirectory=`apps/web`, framework=`nextjs`, sourceFilesOutsideRootDirectory=true, ssoProtection=preview-only. **Git auto-deploy NOT connected yet** (P0-08).
- [x] CI runs lint, tests, build, and deploys (P0-08): **GitHub Actions `ci.yml` green** (lint/format/typecheck/test/build vs ephemeral Postgres+PostGIS/Redis/MinIO). **Git-connected to Vercel** (push `main` → production READY, PRs → preview). **`db-migrate.yml`** = explicit manual migration workflow (set a `DATABASE_URL` repo secret to use it). Optional: branch protection on `main` to gate prod by approval.
- [x] Correlation id traces a request across services (P0-09) — `x-correlation-id` minted/propagated by edge middleware + bound to a request-scoped logger via `withRequestContext`; the contract (`CORRELATION_ID_HEADER`/`Traceable`) lives in `@takeoff/contracts` for the broker/workers to carry in Phase 1. (Vercel error-rate alert is a manual dashboard config — see `docs/runbooks/observability.md`.)
- [ ] GPU worker pool provisioned and scales to zero (P2-02)
- [ ] Payment provider connected in test mode (P4-01)

---

## 9. Cross-cutting rules (never violate, on any task)

- Quantities are computed server-side from authoritative geometry; never trusted from the client or from raw AI output.
- Any work longer than roughly one second runs as an idempotent, retriable background job.
- A sheet's quantities count toward a final report only after its scale is confirmed.
- Org isolation is enforced at the data layer and fails closed; every new customer-owned table gets the org filter.
- Every cross-boundary shape comes from the shared contracts package; no local re-declarations.
- Every model change is measured against the frozen benchmark and never regresses it.
- Money is stored in integer minor units; timestamps in UTC.

---

## 10. Session handoff template

Copy this block into Section 1's notes (or a running log) at the end of each session so the next person resumes instantly.

- Date / author:
- Tasks moved to DONE this session:
- Task left IN_PROGRESS and exactly where it stands:
- New blockers raised (and which tasks they stop):
- New decisions made (also added to Section 7):
- Recommended next task for the following session:
- Anything the next person should not waste time rediscovering:

---

## 11. Definition of done reminders (per phase)

- **Phase 1 done:** upload, process, measure by hand against a confirmed scale, organize into conditions, export a report whose numbers match the on-screen rollups exactly.
- **Phase 2 done:** uploads produce reviewable AI candidates; accept/reject/edit works; unconfirmed-scale quantities excluded from final reports; every correction captured; accuracy metrics visible.
- **Phase 3 done:** order, assign, fulfill, QA, deliver, accept or dispute, all transitions audited and SLAs tracked.
- **Phase 4 done:** charge subscriptions and usage, draw retainers, pay estimators on acceptance, promote a retrained model only when it clears the benchmark.
- **MVP:** Phases 1 through 3 complete and stable; Phase 4 billing live enough to take revenue.
