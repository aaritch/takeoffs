# Phase 3 — Managed-Service Marketplace · Task File

**Goal:** Add an order/fulfillment workflow over the same takeoff tooling. A customer orders a completed takeoff; an estimator is assigned and fulfills it in the same editor; QA reviews it; the customer receives, accepts, or disputes it. Every transition is audited and SLAs are tracked.

**Depends on:** Phases 1–2 (fulfillment uses the same editor, AI candidates, conditions, and rollups).

**Exit criteria:** The full order lifecycle works end to end with enforced transitions, QA, delivery, and an ops dashboard.

**Task ID scheme:** `P3-XX`.

---

## P3-01 — Order model & state machine

**Depends on:** P0-03, P0-06

**Implementation details**

- Implement `Order` and `OrderEvent` per the spec.
- Enforce the lifecycle server-side: `DRAFT → QUOTED → PLACED → ASSIGNED → IN_PROGRESS → IN_QA → REVISIONS (loop) → DELIVERED → ACCEPTED`, with side states `CANCELLED` and `DISPUTED`. Illegal transitions are rejected.
- Every transition writes an immutable `OrderEvent` with actor and payload.

**Test scenarios**

- Each legal transition succeeds; every illegal transition is rejected with a clear error.
- The revisions loop can run multiple times and still reach delivery.
- Cancellation and dispute from valid states behave correctly and are blocked from invalid states.

**Caveats**

- Transition rules belong on the server only; never let the client drive status directly.
- The event log is append-only audit; never mutate or delete events.

---

## P3-02 — Pricing & turnaround rules

**Depends on:** P3-01

**Implementation details**

- Build a configurable rules table that computes `price_quote_minor` and `promised_turnaround_hours` from service tier, requested trade count, sheet count, and priority.
- Rules are data, not hard-coded, so the business can tune pricing without a deploy.

**Test scenarios**

- Representative orders produce the expected quotes and turnaround across tiers and priorities.
- Changing a rule value changes quotes without code changes.
- A rush order applies the correct shorter SLA and price multiplier.

**Caveats**

- The owner/founder sets the actual numbers; engineering provides the mechanism. Keep them out of code.
- Validate that no rule combination can yield a zero or negative price.

---

## P3-03 — Order placement flow

**Depends on:** P3-02, P1-01

**Implementation details**

- From a project, the customer selects tier, trades, priority, and scope notes; the system shows the quote and turnaround; the customer confirms.
- On confirmation, authorize payment or draw against a retainer balance, then move the order to `PLACED` and into the queue.

**Test scenarios**

- A customer can place an order against an uploaded plan set and see the quote before confirming.
- A failed payment authorization keeps the order out of the queue and surfaces a clear message.
- Retainer draw-down reduces the balance correctly (full retainer logic lands in Phase 4; stub the balance check here).

**Caveats**

- Do not enqueue work until payment/retainer is secured, or the service team fulfills unpaid orders.

---

## P3-04 — Estimator assignment & capacity

**Depends on:** P3-01

**Implementation details**

- Match orders to a `SERVICE_ESTIMATOR` by trade specialty, current capacity, and priority; allow rules-based auto-assignment with manual override by a platform admin.
- Track each estimator's concurrent-order capacity and update it as orders move.

**Test scenarios**

- An order is assigned to an eligible, under-capacity estimator matching the trades.
- An admin can reassign an order; capacity counts update on both estimators.
- When no estimator is available, the order waits visibly rather than failing.

**Caveats**

- Service estimators must only access plan sets for orders explicitly assigned to them — verify the isolation check denies access to unassigned orders' projects.

---

## P3-05 — Fulfillment in the shared editor

**Depends on:** P3-04, P1-09, P2-10

**Implementation details**

- The assigned estimator opens the customer's plan set in the same editor, runs/reviews AI candidates, and produces a `Takeoff` with `origin = MANAGED_SERVICE`.
- Moving from `ASSIGNED` to `IN_PROGRESS` is recorded; the estimator works against the requested trades and scope notes.

**Test scenarios**

- An estimator can complete a full takeoff for an assigned order using the standard tools.
- The produced takeoff is correctly linked to the order and marked managed-service origin.

**Caveats**

- No separate fulfillment editor; reuse keeps quality consistent and avoids divergence. Any special-casing here is a smell.

---

## P3-06 — QA workflow · GATE

**Depends on:** P3-05

**Implementation details**

- On completion the order moves to `IN_QA`; a `SERVICE_QA` reviewer works through a checklist: scale confirmed on every sheet, all requested trades covered, quantities spot-checked, report renders cleanly.
- QA approves (→ `DELIVERED`) or returns to the estimator (→ `REVISIONS`) with notes.

**Test scenarios**

- An order missing a requested trade or with an unconfirmed-scale sheet fails QA and returns to the estimator.
- An approved order advances to delivered with the checklist recorded.
- The revisions loop preserves prior context and notes.

**Caveats**

- The checklist is the quality backbone of the marketplace; the domain estimator owns its contents. Do not let orders bypass QA.

---

## P3-07 — Delivery, acceptance, and dispute

**Depends on:** P3-06

**Implementation details**

- Delivery links the finished takeoff to the order, notifies the customer, and unlocks report exports.
- The customer can `ACCEPT` or open a `DISPUTE` within a defined window; absent action, auto-accept after the window.

**Test scenarios**

- On delivery the customer is notified and can export reports.
- Acceptance closes the order and (in Phase 4) triggers payout.
- A dispute pauses progression and routes for resolution; auto-accept fires correctly after the window when no action is taken.

**Caveats**

- Define the dispute and auto-accept windows explicitly and make them visible to the customer.
- Do not release payout until acceptance or auto-accept (payout itself lands in Phase 4).

---

## P3-08 — Internal ops dashboard

**Depends on:** P3-04

**Implementation details**

- Build the service-team dashboard: live order queue, SLA timers against `promised_turnaround_hours`, estimator capacity/load, and escalation of approaching or breached SLAs to platform admins.

**Test scenarios**

- The queue reflects order states in real time.
- An order approaching its SLA escalates and is visibly flagged.
- Capacity and load per estimator are accurate.

**Caveats**

- SLA timers run from `placed_at`; pauses (e.g., during a customer-caused hold) must be defined so the business is not penalized for waiting on the customer.

---

## P3-09 — Order audit trail

**Depends on:** P3-01

**Implementation details**

- Ensure every lifecycle transition and assignment writes a complete `OrderEvent` with actor, role, from/to status, and payload.

**Test scenarios**

- A full order journey produces a coherent, gap-free event history.
- Events are immutable; an attempt to alter one is rejected.

**Caveats**

- This trail is the basis for dispute resolution and trust; completeness matters more than brevity.

---

## Phase 3 completion check

- [ ] Order lifecycle enforced server-side with full event audit (P3-01)
- [ ] Pricing/turnaround driven by a configurable rules table
- [ ] Assignment respects specialty, capacity, and order-scoped isolation
- [ ] Fulfillment reuses the standard editor
- [ ] QA checklist gates delivery (P3-06 gate)
- [ ] Delivery, acceptance, dispute, and auto-accept work
- [ ] Ops dashboard shows queue, SLA timers, and escalations
