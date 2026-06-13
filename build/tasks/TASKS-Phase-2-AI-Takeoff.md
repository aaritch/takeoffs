# Phase 2 — AI Takeoff with Human Review · Task File

**Goal:** Automatically produce reviewable takeoff candidates from a processed plan set. Every candidate is human-reviewable, never silently authoritative; quantities from unconfirmed-scale sheets are excluded from final reports; every correction is captured as training signal; accuracy is measured openly.

**Depends on:** Phase 1 (the viewer, geometry package, conditions, and rollups are reused wholesale).

**Exit criteria:** Uploading a plan set yields AI candidates in the editor that a reviewer can accept/reject/edit; the scale gate holds; feedback is captured; the accuracy dashboard is live.

**Task ID scheme:** `P2-XX`.

---

## P2-01 — Stage contracts mirrored across planes

**Depends on:** P0-02

**Implementation details**

- Define the input/output contract for each pipeline stage in the contracts package and mirror it in the Python inference service.
- The contract fixes each stage's shape so models can be swapped without touching orchestration.

**Test scenarios**

- A sample payload validates identically on the TypeScript and Python sides.
- A stage output missing a required field is rejected before the next stage runs.

**Caveats**

- The stage contract is the seam that lets ML iterate independently; keep orchestration ignorant of model internals.

---

## P2-02 — GPU worker pool & inference skeleton

**Depends on:** P0-04

**Implementation details**

- Provision a GPU node pool that scales on the AI queue depth and scales to zero when idle.
- Stand up the inference service skeleton that pulls jobs, loads pinned model versions from the registry, and records a `ModelRun` with full version lineage.

**Test scenarios**

- A queued sheet job is picked up, runs a no-op pipeline, and writes a `ModelRun` with recorded versions.
- The GPU pool scales up under load and back to zero when idle.

**Caveats**

- GPU cost is a primary margin risk; verify scale-to-zero actually releases the expensive nodes, not just the pods.
- Pin and record every model version per run; reproducibility depends on it.

---

## P2-03 — Pipeline orchestration with partial failure

**Depends on:** P2-01, P2-02

**Implementation details**

- Orchestrate the stages per sheet; persist each stage's output so any stage can be re-run independently.
- On a stage failure for one sheet, continue the rest of the set and mark the `ModelRun` `PARTIAL` with error detail.
- Make re-running a sheet replace its prior candidate set under a new run, never duplicate.

**Test scenarios**

- A forced failure in one stage on one sheet leaves other sheets' results intact and the run marked partial.
- Re-running a sheet replaces candidates rather than duplicating them.

**Caveats**

- Idempotency is essential; retries must not multiply candidates.

---

## P2-04 — Stages: classification, OCR, scale detection

**Depends on:** P2-03

**Implementation details**

- Sheet classification predicts discipline and page type, routing downstream detectors (a schedule page goes to table extraction, not geometry detection).
- OCR extracts text with positions, including dimension strings and the scale notation.
- Scale detection derives `unit_per_pixel` from printed scale, a graphic scale bar, or cross-checked dimension strings, producing a `SheetScale` candidate with confidence.

**Test scenarios**

- Page types are classified correctly on a representative sample.
- Scale detection matches the confirmed scale within tolerance on standard sheets at the target rate.
- A sheet with an unusual or missing scale produces a low-confidence result rather than a confident wrong one.

**Caveats**

- Overconfident wrong scale is the worst failure mode in the product; calibrate confidence so uncertainty is expressed, not hidden.

---

## P2-05 — Scale-confidence gate · GATE

**Depends on:** P2-04

**Implementation details**

- When `SheetScale.confidence` is below threshold or unset, mark the sheet's quantities provisional, surface a mandatory human confirmation, and exclude that sheet from final reports until confirmed.

**Test scenarios**

- A low-confidence sheet's quantities are visibly provisional and absent from a generated final report.
- Confirming the scale promotes the sheet's quantities into final reporting.

**Caveats**

- This gate protects the integrity of every bid built on the platform. Do not allow a "skip" that silently trusts an unconfirmed scale.

---

## P2-06 — Stages: line/wall and area detection

**Depends on:** P2-03

**Implementation details**

- Segmentation models identify linear elements (walls, footings, curb lines, pipe runs) and closed regions (rooms, slabs, paving), then vectorize them into clean polylines and polygons including interior cutouts.

**Test scenarios**

- Detected lines and regions vectorize to geometry within an acceptable deviation from hand-traced ground truth.
- Interior cutouts are subtracted in detected area regions.

**Caveats**

- Vectorization quality (snapping endpoints, merging collinear segments, closing polygons) often matters more than raw model output; budget for cleanup.

---

## P2-07 — Stage: symbol/object detection for counts

**Depends on:** P2-03

**Implementation details**

- Object detection locates and classifies repeated symbols (doors, fixtures, columns, light fixtures, receptacles, trees) for count conditions, handling dense, small, repeated marks.

**Test scenarios**

- Common symbol classes are detected at the target precision/recall on a representative sample.
- Densely packed symbols are individually separated, not merged or missed.

**Caveats**

- Legends vary between firms; the same symbol may mean different things across sets. Tie detection to the sheet's own legend where possible.

---

## P2-08 — Vectorization, mapping, quantification, confidence

**Depends on:** P2-06, P2-07, P1-08

**Implementation details**

- Clean and deduplicate detections; map each detected class to a `Condition` (matching existing or creating new) with the correct measurement type and unit; apply the sheet scale to compute real-world `raw_value` using the same geometry package as the manual tools; assemble a single confidence per candidate.

**Test scenarios**

- AI quantities for a sheet match human-verified quantities within the target error once scale is confirmed.
- Duplicate/overlapping detections are merged to a single measurement.
- Class-to-condition mapping lands in the right trade and unit.

**Caveats**

- AI must use the identical scale-conversion path as manual tools; any divergence produces inconsistent numbers between modes.

---

## P2-09 — Candidate layer in the editor

**Depends on:** P1-07

**Implementation details**

- Render AI candidates in a visually distinct layer (e.g., dashed/translucent) separate from accepted measurements, with per-candidate confidence on hover and clear accept/reject/edit affordances.

**Test scenarios**

- Candidates are unmistakably distinct from accepted measurements at every zoom level.
- Hovering reveals confidence; the controls are reachable without obscuring the drawing.

**Caveats**

- Visual clutter is a real risk on dense sheets; provide filtering by confidence and by condition.

---

## P2-10 — Review actions & bulk accept

**Depends on:** P2-09, P1-11

**Implementation details**

- Implement accept, reject, edit-geometry, reclassify, and add-missed, plus bulk-accept-by-confidence within a condition.
- Accepting converts a candidate to an accepted measurement and feeds the authoritative rollup.

**Test scenarios**

- Each action updates the measurement state and the rollup correctly.
- Bulk-accept above a chosen confidence promotes the right set and leaves the rest unreviewed.
- Editing a candidate's geometry recomputes its quantity.

**Caveats**

- Default auto-accept conservatively; only widen it per class once production accuracy is proven (Phase 4).

---

## P2-11 — Feedback capture · GATE

**Depends on:** P2-10

**Implementation details**

- Write a `DetectionFeedback` row for every review action with before/after geometry, from/to class, the originating model version, and the actor — this is the training signal for the flywheel.

**Test scenarios**

- Each action type produces a feedback row with complete, correct provenance.
- Feedback volume reconciles with the count of review actions (nothing dropped).

**Caveats**

- Missing or lossy feedback starves the flywheel; treat capture as a first-class requirement, not telemetry that can fail quietly.
- Respect the org training opt-out at capture or assembly time, per the spec.

---

## P2-12 — Accuracy dashboard

**Depends on:** P2-11

**Implementation details**

- Surface the spec's metrics: count F1, linear/area quantity error, scale-detection accuracy, review burden, and coverage — broken down per class and per discipline, not just aggregate.

**Test scenarios**

- Metrics compute correctly against a labeled evaluation set.
- A regression in a class is visible in the per-class view.

**Caveats**

- Aggregate-only metrics hide per-class failures; the breakdown is what guides where to widen autonomy.
- Distinguish model accuracy from reviewer behavior; both move the numbers.

---

## Phase 2 completion check

- [ ] Upload triggers AI candidates automatically
- [ ] Scale gate excludes unconfirmed sheets from final reports (P2-05 gate)
- [ ] Reviewer can accept/reject/edit/reclassify and bulk-accept
- [ ] Every correction is captured as feedback (P2-11 gate)
- [ ] Accuracy dashboard shows per-class and per-discipline metrics
