# Task Files — Index & Conventions

These task files turn the project plan into actionable, testable work items. Each file covers one phase, and each task within is written to a consistent shape so it can be picked up, built, and verified independently.

## The files

| File | Phase | Focus |
|------|-------|-------|
| TASKS-Phase-0-Foundations.md | 0 | Monorepo, contracts, auth/RBAC, org isolation, CI/CD, observability, seed data |
| TASKS-Phase-1-Manual-Takeoff.md | 1 | Upload, ingestion, tiling, viewer, measurement tools, conditions, rollups, reports |
| TASKS-Phase-2-AI-Takeoff.md | 2 | Inference plane, pipeline stages, scale gate, candidate review, feedback, accuracy |
| TASKS-Phase-3-Managed-Service.md | 3 | Order lifecycle, pricing, assignment, QA, delivery, ops dashboard |
| TASKS-Phase-4-5-Billing-Flywheel-Hardening.md | 4 & 5 | Billing, usage, payouts, training/promotion, assemblies, integrations; multi-region, SSO, webhooks, pen test |

Read alongside: **Takeoff-Platform-Technical-Spec.md** (the what) and **Takeoff-Platform-Project-Plan.md** (the structure, file tree, and contracts).

## Task ID scheme

Each task has an ID like `P1-06` (phase 1, task 6). Dependencies reference other IDs across files (e.g., a Phase 2 task depending on `P1-08`). Build in phase order; within a phase, respect the stated dependencies.

## Anatomy of a task

Every task follows the same structure:

- **Title** — the outcome, not the activity.
- **Depends on** — task IDs that must land first.
- **Implementation details** — what to build and the rules it must honor, without prescribing code.
- **Test scenarios** — the concrete cases that prove it works, including failure and edge cases, not just the happy path.
- **Caveats** — the traps, judgment calls, and easy-to-get-wrong details specific to that task.

## Gates

Tasks and checklist items marked **GATE** must pass before the next phase begins. They concentrate where mistakes are expensive to undo: org isolation, the viewer performance budget, server-authoritative quantities, export parity, the scale-confidence gate, feedback capture, QA, payouts, and model promotion. Treat a failing gate as a release blocker.

## How to work through them

1. Start at Phase 0 and do not skip the gates — they are the foundation everything else assumes.
2. For each task, write the test scenarios first where practical; they are already enumerated for you.
3. Keep every cross-boundary shape in the shared contracts package; never re-declare a shape locally.
4. When a task touches money, geometry/quantities, or cross-tenant access, slow down — those three areas are where correctness matters most and mistakes are most damaging.
5. Update the phase completion checklist at the bottom of each file as you go; a phase is done only when its checklist and gates pass.

## Cross-cutting rules that apply to every task

- Quantities are computed server-side from authoritative geometry — never trusted from the client or from raw AI output.
- Any work over roughly one second runs as an idempotent, retriable background job.
- A sheet's quantities count toward a final report only after its scale is confirmed.
- Org isolation is enforced at the data layer and fails closed.
- Every model change is measured against the frozen benchmark and never regresses it.
