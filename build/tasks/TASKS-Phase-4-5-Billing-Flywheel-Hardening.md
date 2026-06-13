# Phases 4 & 5 — Billing, Flywheel & Hardening · Task File

**Goal (Phase 4):** Turn the platform into a business that can charge, meter, pay estimators, and improve its own models safely. **Goal (Phase 5):** Harden for scale, security, and enterprise readiness.

**Depends on:** Phases 1–3.

**Task ID scheme:** `P4-XX` and `P5-XX`.

---

# Phase 4 — Billing, scale, and the flywheel

## P4-01 — Subscriptions & seats

**Depends on:** P0-06

**Implementation details**

- Integrate subscriptions and seat management with the payment provider; treat the provider's webhooks as the source of truth for subscription and payment state.
- Map plan tiers to seat limits and feature/quota entitlements.

**Test scenarios**

- Creating, upgrading, downgrading, and cancelling a subscription updates entitlements correctly via webhook.
- A past-due subscription transitions the org to the correct restricted state.
- Seat limits enforce against membership as defined in Phase 0.

**Caveats**

- Never treat a local write as authoritative for billing state; reconcile to provider webhooks, which can arrive out of order or be retried.
- Handle webhook idempotency; the same event may be delivered more than once.

---

## P4-02 — Usage metering & quotas

**Depends on:** P2-03, P1-13

**Implementation details**

- Meter billable events as `UsageRecord`: AI takeoff runs, managed orders, and exports beyond quota.
- Enforce quotas per plan and surface usage to the customer.

**Test scenarios**

- Each billable event creates exactly one usage record; reconcile counts against the underlying actions.
- Crossing a quota boundary behaves per policy (block, warn, or overage-charge as configured).

**Caveats**

- Double-counting or missed counts both erode trust and revenue; metering must be exactly-once relative to the billable action.

---

## P4-03 — Retainers & draw-down

**Depends on:** P3-03

**Implementation details**

- Implement retainer balances and draw-down against managed-service orders, replacing the Phase 3 stub.
- Track balance, top-ups, and draws with an auditable ledger.

**Test scenarios**

- Placing an order draws the correct amount; an insufficient balance blocks or requests a top-up.
- The ledger reconciles to the current balance at all times.

**Caveats**

- Use an append-only ledger; never mutate a balance field in place without a corresponding ledger entry.

---

## P4-04 — Estimator payouts · GATE

**Depends on:** P3-07

**Implementation details**

- On order acceptance (or auto-accept after the dispute window), create a `PayoutRecord` and settle it through the provider's payout/transfer mechanism; pause on dispute; support reversal.

**Test scenarios**

- An accepted order produces a payout in the correct amount and status progression.
- A disputed order does not pay out until resolved.
- A reversal moves the record to the correct state and is auditable.

**Caveats**

- Payments out are higher-stakes than payments in; require strong reconciliation and never auto-pay a disputed or unaccepted order.
- Do not initiate transfers from the client or any unauthenticated path.

---

## P4-05 — Training & evaluation pipeline · GATE

**Depends on:** P2-11

**Implementation details**

- Build the offline `ml` pipeline: assemble datasets from `DetectionFeedback` and labeled ground truth (honoring org opt-outs), train/fine-tune per model family, and evaluate against a frozen, held-out benchmark set.
- Record dataset provenance and the originating model version for every example.

**Test scenarios**

- A training run consumes a versioned dataset and produces a candidate model with metrics.
- Evaluation reports per-class and per-discipline metrics against the frozen benchmark.
- An opted-out org's data is verifiably absent from assembled datasets.

**Caveats**

- The benchmark set must be frozen and never leak into training, or metrics become meaningless.
- This pipeline must never touch the request path; it is fully offline.

---

## P4-06 — Model promotion & rollback · GATE

**Depends on:** P4-05, P2-02

**Implementation details**

- Promote a model only when it shows non-regression against the benchmark; register it and roll it out behind a version flag; rollback is a version switch, not a redeploy.

**Test scenarios**

- A model that regresses any tracked metric is blocked from promotion.
- A promoted model is served by version; a rollback reverts serving immediately.
- The serving version is recorded on every subsequent `ModelRun`.

**Caveats**

- Tie autonomy widening (auto-accept thresholds) to proven per-class production accuracy, not to a single benchmark pass.

---

## P4-07 — Assemblies

**Depends on:** P1-10

**Implementation details**

- Implement assemblies: one drawn geometry populating multiple linked conditions via multiplier factors (e.g., a wall assembly driving stud, drywall, and track quantities together).

**Test scenarios**

- Drawing against an assembly updates every child condition by the correct factor.
- Editing the geometry recomputes all linked quantities consistently.

**Caveats**

- Keep the relationship explicit and visible; hidden multipliers make quantities hard to audit and erode trust.

---

## P4-08 — Integration exports

**Depends on:** P1-13

**Implementation details**

- Produce structured exports compatible with common estimating and accounting tools so quantities flow into the customer's pricing workflow.

**Test scenarios**

- An export imports cleanly into the target tool with quantities and groupings intact.
- Malformed or partial data is rejected with a clear error rather than producing a corrupt file.

**Caveats**

- Target formats drift between versions; pin to documented format versions and test against real target software, not assumptions.

---

# Phase 5 — Hardening & growth

## P5-01 — Multi-region readiness & DR drills

**Implementation details**

- Make the architecture multi-region-capable; validate backups, point-in-time recovery, and object-storage versioning against the spec's RPO/RTO targets through real restore drills.

**Test scenarios**

- A simulated region or database loss is recovered within the RTO with data loss within the RPO.
- A restore drill from backups succeeds end to end on a schedule.

**Caveats**

- Backups that are never restored are not backups; drills are mandatory, not optional.

---

## P5-02 — SSO & MFA for enterprise

**Depends on:** P0-05

**Implementation details**

- Add SAML/OIDC single sign-on and MFA for larger customers; map provider identities to memberships.

**Test scenarios**

- An enterprise user signs in via their identity provider and lands in the correct org with the correct role.
- MFA enforcement blocks a login that fails the second factor.

**Caveats**

- Just-in-time provisioning rules (who gets which role on first SSO login) must be explicit to avoid over-granting access.

---

## P5-03 — Outbound webhooks

**Depends on:** P0-09

**Implementation details**

- Let customer orgs subscribe to events (takeoff complete, order delivered) for their own tooling, with signed, retried, idempotent delivery.

**Test scenarios**

- A subscribed event is delivered, signed, and retried on transient failure.
- A consumer receiving a duplicate can detect it via the idempotency key.

**Caveats**

- Never include sensitive payload data beyond what the subscriber needs; webhooks leave your trust boundary.

---

## P5-04 — Advanced collaboration

**Depends on:** P1-07

**Implementation details**

- Richer presence, comments anchored to measurements, and clearer live multi-user editing cues.

**Test scenarios**

- Two users editing the same takeoff see each other's presence and changes promptly.
- A comment anchors to the correct measurement and survives geometry edits.

**Caveats**

- Real-time deltas remain non-authoritative; the database is still the source of truth on reconnect.

---

## P5-05 — Cloud-storage import

**Implementation details**

- Let customers import plan sets directly from their existing document storage, reusing the standard ingestion pipeline.

**Test scenarios**

- An import from a connected source produces the same processed result as a direct upload.
- A permission or fetch failure surfaces clearly without leaving a half-imported set.

**Caveats**

- Treat imported files with the same validation and malware scanning as uploads; an external source is not a trusted source.

---

## P5-06 — Security review & penetration test

**Depends on:** P0-07

**Implementation details**

- Commission an external penetration test focused on tenant isolation, auth, payments, and file handling; remediate findings on a tracked schedule.

**Test scenarios**

- Isolation, auth-bypass, and injection attempts in the test all fail.
- Each finding has a tracked remediation and a verification re-test.

**Caveats**

- Schedule the test after Phase 3, when the marketplace has widened the attack surface (cross-actor access, payouts, file flows).

---

## Phases 4 & 5 completion check

- [ ] Subscriptions, usage metering, and retainers are live and reconcile to the provider
- [ ] Estimator payouts settle only on acceptance (P4-04 gate)
- [ ] Training pipeline assembles datasets and respects opt-outs (P4-05 gate)
- [ ] Model promotion blocks regressions and supports instant rollback (P4-06 gate)
- [ ] Assemblies and integration exports work
- [ ] DR drills meet RPO/RTO; SSO/MFA, webhooks, and import shipped
- [ ] External penetration test passed and findings remediated
