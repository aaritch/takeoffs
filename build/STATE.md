# STATE.md — Build Tracker

This is the living state of the build. It is the single place a developer (or coding agent) checks to answer: what is done, what is next, what is blocked, and what decisions have been made. Update it at the end of every working session. If this file and your memory disagree, this file wins.

**Project:** On-Demand Takeoff Platform (hybrid web app, AI auto-takeoff with human review)
**Companion docs:** Takeoff-Platform-Technical-Spec.md, Takeoff-Platform-Project-Plan.md, and the five TASKS-Phase-\*.md files (the per-task implementation details, test scenarios, and caveats).

---

## 1. Current focus

- **Active phase:** Phase 0 — Foundations
- **Active task:** P0-02 — Contracts package skeleton (next)
- **Next up:** P0-03, then P0-04 (P0-04 can run in parallel with P0-02/03)
- **Open blockers:** none recorded yet (see Section 6)
- **Last updated:** 2026-06-13, aarit — P0-01 (monorepo & workspace tooling) DONE

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

### Phase 0 — Foundations  (progress: 1/10 DONE)

| ID | Task | Depends on | Gate | Owner | Status |
|----|------|-----------|------|-------|--------|
| P0-01 | Monorepo and workspace tooling | none | no | aarit | DONE |
| P0-02 | Contracts package skeleton | P0-01 | no | - | NOT_STARTED |
| P0-03 | Core enumerations | P0-02 | no | - | NOT_STARTED |
| P0-04 | Infrastructure for the dev environment | P0-01 | no | - | NOT_STARTED |
| P0-05 | Identity provider and login flow | P0-04 | no | - | NOT_STARTED |
| P0-06 | Accounts module: orgs, memberships, RBAC | P0-05, P0-03 | no | - | NOT_STARTED |
| P0-07 | Org-isolation data-access layer | P0-06 | YES | - | NOT_STARTED |
| P0-08 | CI/CD pipeline | P0-01, P0-04 | no | - | NOT_STARTED |
| P0-09 | Observability skeleton | P0-08 | no | - | NOT_STARTED |
| P0-10 | Seed trade structure and starter conditions | P0-03 | YES | - | NOT_STARTED |

### Phase 1 — Manual Takeoff  (progress: 0/14 DONE)

| ID | Task | Depends on | Gate | Owner | Status |
|----|------|-----------|------|-------|--------|
| P1-01 | Direct-to-storage uploads | P0-04, P0-07 | no | - | NOT_STARTED |
| P1-02 | Ingestion: validate, scan, split | P1-01 | no | - | NOT_STARTED |
| P1-03 | Rasterize and tile | P1-02 | no | - | NOT_STARTED |
| P1-04 | Extraction and sheet metadata | P1-03 | no | - | NOT_STARTED |
| P1-05 | Processing status model and progress UI | P1-02 | no | - | NOT_STARTED |
| P1-06 | Tiled viewer canvas | P1-03 | YES | - | NOT_STARTED |
| P1-07 | Vector overlay and selection | P1-06 | no | - | NOT_STARTED |
| P1-08 | Scale calibration and geometry package | P1-07 | no | - | NOT_STARTED |
| P1-09 | Manual measurement tools | P1-08 | no | - | NOT_STARTED |
| P1-10 | Conditions, units, and factors | P0-10, P1-08 | no | - | NOT_STARTED |
| P1-11 | Server-authoritative quantity rollups | P1-09, P1-10 | YES | - | NOT_STARTED |
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

**Totals:** 59 tasks. 1 DONE / 0 IN_PROGRESS / 0 BLOCKED / 58 NOT_STARTED. Update these counts as you go.

---

## 5. Gate checklist

A gate must have passing tests before the phase it belongs to is considered finished and the next phase begins. Mark each PASS only when its task is DONE and verified.

- [ ] P0-07 — Org isolation proven across every entity (fail-closed)
- [ ] P0-10 — Seed trades and conditions exist and are estimator-approved
- [ ] P1-06 — Viewer meets the performance budget on representative hardware
- [ ] P1-11 — Quantity rollups are server-authoritative and tamper-proof
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
| - | - | none recorded | - | - | - |

---

## 7. Decision log

Record decisions that future tasks depend on, especially the ones with no single right answer. This prevents re-litigating settled choices and explains why something is the way it is. Newest at the top. Mirror significant entries into a proper ADR file under docs/adr.

| Date | Decision | Context / rationale | Affects |
|------|----------|---------------------|---------|
| 2026-06-13 | Workspace tooling: **pnpm 9 workspaces + Turborepo 2**; ESLint 9 flat config + Prettier 3; internal scope `@takeoff/*` | P0-01. Canonical Vercel monorepo. Cross-package deep imports blocked by ESLint `no-restricted-imports` now. **Gotcha:** `corepack enable` fails on this Windows box (EPERM writing to `C:\Program Files\nodejs`) — pnpm was installed via `npm i -g pnpm@9.15.4` into the user prefix instead. Use that, not corepack, here. | P0-02+ (all TS packages/apps) |
| 2026-06-13 | Hosting: app plane on **Vercel**, source of truth on **GitHub** | Product is hosted on Vercel; GitHub drives deploys (Vercel git integration) + GitHub Actions for CI. Vercel cannot run GPU/long workers/persistent WebSockets, so hosting is split by plane. | P0-01, P0-04, P0-08, all app-plane tasks |
| 2026-06-13 | Frontend + app API: **Next.js (App Router)** full-stack on Vercel | Vercel-native; collapses the spec's Vite SPA + standalone NestJS into one app. Domain logic kept framework-agnostic under `apps/web/server` so it stays portable. Drop `sdk-client`. | P0-01, P0-02, P1-*, all API modules |
| 2026-06-13 | Data stores: **Neon Postgres + PostGIS**, **Upstash Redis**, **Vercel Blob** | Vercel Marketplace integrations; Neon supports the required spatial extension. Least ops, tightest Vercel fit. | P0-04, P1-01, P1-08, geometry/measurements |
| 2026-06-13 | Processing/AI/realtime compute home: **TBD at Phase 2** | Phases 0–1 run on Vercel + Neon + Upstash + Blob. GPU inference, long workers, and the WebSocket gateway need a second host (serverless GPU like Modal/Replicate, or a container host like Render/Fly/AWS) — decide when AI lands. | P2-02, P2-*, P1-02..P1-04 (workers), realtime |
| - | Working raster DPI for sheets: TBD | Too low harms AI accuracy; too high inflates storage and processing | P1-03, P2-04, P2-06, P2-07 |
| - | Self-intersecting polygon policy: TBD (reject or auto-correct) | Areas must never be ambiguous | P1-09, geometry package |
| - | Launch trade list and condition units: TBD with domain estimator | Wrong units corrupt every quantity downstream | P0-10, P1-10 |
| - | Auto-accept confidence thresholds per class: start conservative | Trust depends on not auto-accepting wrong candidates | P2-10, P4-06 |
| - | Dispute and auto-accept windows for orders: TBD | Must be explicit and customer-visible | P3-07, P4-04 |

> Replace each TBD with the chosen value and the date once decided. Do not start a dependent task on a TBD without logging the assumption you are proceeding under.

---

## 8. Environment and setup state

Track whether the shared scaffolding actually works, separate from feature progress. A coder resuming cold needs to know what is already standing.

- [x] Repository cloned and builds from clean checkout (P0-01) — `pnpm install && pnpm build` green; lint/format gates verified
- [ ] Contracts package importable across workspaces (P0-02)
- [ ] Dev environment provisioned from IaC; database spatial extension confirmed (P0-04)
- [ ] Identity provider configured; login works end to end (P0-05)
- [ ] CI runs lint, tests, build, and deploys to staging (P0-08)
- [ ] Correlation id traces a request across services (P0-09)
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
