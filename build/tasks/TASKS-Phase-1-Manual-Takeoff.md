# Phase 1 — Manual Takeoff · Task File

**Goal:** Ship a usable self-serve takeoff product without AI: upload drawings, process them into a smooth zoomable viewer, measure quantities by hand against a confirmed scale, organize them into conditions, and export a report whose numbers exactly match what is on screen.

**Why first:** The viewer and the geometry/quantity math are the hardest, highest-risk parts of the whole product. Proving them with manual tools de-risks the AI work and produces the training ground truth later.

**Exit criteria:** The end-to-end flow above works and is pleasant to use; exported numbers equal on-screen rollups exactly.

**Task ID scheme:** `P1-XX`.

---

## P1-01 — Direct-to-storage uploads

**Depends on:** P0-04, P0-07

**Implementation details**

- The API issues short-lived signed upload URLs; files go straight to object storage and never stream through application servers.
- Support resumable/multipart upload for large sets and unreliable job-site connections.
- On client-reported completion, the API verifies checksum and size, records the `SourceFile`, and enqueues ingestion.

**Test scenarios**

- A large multi-file plan set uploads successfully, including a simulated mid-upload network drop that resumes.
- A checksum mismatch is detected and the file is rejected.
- An unsupported file type is rejected at the boundary with a specific message.

**Caveats**

- Validate type and size before issuing the signed URL and again on completion; never trust the client's content-type alone.
- Set sensible per-file and per-set ceilings now; very large CAD sets can otherwise overwhelm processing.

---

## P1-02 — Ingestion: validate, scan, split

**Depends on:** P1-01

**Implementation details**

- Build the `worker-files` ingest steps: confirm type, scan for malware, inventory pages, and split each page into a `Sheet` record.
- Drive steps from job messages; each step writes its status to the `SourceFile`/`PlanSet` status fields.

**Test scenarios**

- A multi-page document yields the correct number of `Sheet` rows in order.
- A malware-flagged file halts processing and notifies the uploader.
- Re-running ingestion for an already-processed file is a no-op (idempotent).

**Caveats**

- Page order must be preserved deterministically; downstream sheet numbering depends on it.
- A corrupt or partially readable file must fail that file without taking down the whole plan set.

---

## P1-03 — Rasterize & tile

**Depends on:** P1-02

**Implementation details**

- Render each page to a working-resolution raster suitable for both viewing and later detection.
- Generate the deep-zoom tile pyramid (fixed tile size, halving resolution per level) plus a thumbnail; store under the sheet's tile prefix.
- Record sheet pixel dimensions and DPI.

**Test scenarios**

- Tiles exist for every zoom level and stitch seamlessly with no gaps or misalignment.
- A very large sheet produces a complete pyramid within the processing budget.
- The thumbnail renders and is correctly oriented.

**Caveats**

- Choose the working DPI carefully: too low harms detection accuracy later; too high explodes storage and processing time. Document the choice.
- Keep tile coordinate conventions identical to what the viewer expects, or overlays will misalign.

---

## P1-04 — Extraction & sheet metadata

**Depends on:** P1-03

**Implementation details**

- OCR the sheet to extract candidate `sheet_number`, `sheet_title`, and `discipline`; for vector sources, preserve native geometry for later detection.
- Populate sheet metadata as candidates; all fields remain user-editable, and user edits win over future re-extraction.
- Write search index entries for the sheet.

**Test scenarios**

- Sheet number/title are extracted correctly on a representative sample and remain editable.
- Editing a sheet's metadata persists and is not overwritten by reprocessing.
- A sheet with no recognizable title degrades gracefully to an editable blank, not an error.

**Caveats**

- Extraction will be imperfect; never block the user on it. The viewer must work even when metadata is missing.

---

## P1-05 — Processing status model & progress UI

**Depends on:** P1-02

**Implementation details**

- Implement the status fields for `SourceFile.ingest_status` and `PlanSet.processing_status` per the spec and surface granular per-file and per-sheet progress in the client.
- The client subscribes to processing updates (via the realtime channel or polling) and shows what is ready versus pending.

**Test scenarios**

- Progress advances through each stage visibly; a failed file shows a clear error and a retry option.
- The first sheets become viewable before the entire set finishes.

**Caveats**

- A single opaque spinner is a defect; users uploading large sets need to see real progress or they assume the app is broken.

---

## P1-06 — Tiled viewer canvas · GATE

**Depends on:** P1-03

**Implementation details**

- Build the viewer that pans and zooms against the tile pyramid, requesting only visible tiles at the current level and streaming detail in.
- Load the overview level first for instant first paint.
- Maintain a viewport transform that the overlay layer (P1-07) shares.

**Test scenarios**

- Pan and zoom hold a smooth frame rate on a large sheet; an extreme sheet degrades gracefully without freezing.
- First overview paint appears within the performance budget on a normal connection.
- Switching sheets shows the new overview quickly.

**Caveats**

- This is the make-or-break UX surface; budget real time for it and test on representative hardware, not just a fast dev machine.
- Tile requests must be cancelable on fast pan/zoom or the network floods.

---

## P1-07 — Vector overlay & selection

**Depends on:** P1-06

**Implementation details**

- Render all measurements for the current sheet in a vector layer aligned to the tile coordinate system via the shared viewport transform.
- Use a performant rendering approach for thousands of objects; hit-test against vector geometry, not pixels.
- Color-code by condition and support selecting, multi-selecting, and highlighting.

**Test scenarios**

- Selecting an object near others picks the right one at multiple zoom levels.
- Thousands of objects render without stalling pan/zoom.
- Overlay geometry stays pixel-aligned to the drawing at every zoom level.

**Caveats**

- Geometry is stored in normalized sheet coordinates; the overlay must derive screen positions from the transform, never store screen coordinates.

---

## P1-08 — Scale calibration & geometry package

**Depends on:** P1-07

**Implementation details**

- Implement two-point manual scale calibration: the user draws a segment, enters its real-world length, and the system computes `unit_per_pixel` and writes a `SheetScale` with `calibration_method = TWO_POINT_MANUAL`.
- Build the shared, pure `geometry` package: length, area (with interior-ring subtraction), unit conversions, and the single scale-conversion function used by every tool and later by AI.

**Test scenarios**

- A known segment calibrated to a known length yields correct lengths and areas elsewhere on the sheet (verified against hand calculation).
- Area with a cutout returns outer area minus the hole.
- Imperial and metric calibration both convert correctly to canonical base units.

**Caveats**

- Every quantity in the product flows through this package; its tests should be exhaustive. A subtle error here corrupts bids silently.
- A sheet without a confirmed scale must not contribute trusted quantities; mark it clearly.

---

## P1-09 — Manual measurement tools

**Depends on:** P1-08

**Implementation details**

- Implement linear (polyline with vertex add/move/delete), area (polygon with cutouts), and count (point placement) tools, plus snapping (to detected lines/intersections once available) and ortho-lock.
- Show a live length/area readout while drawing.
- New geometry attaches to the active condition.

**Test scenarios**

- Drawing, editing vertices, and deleting work for each tool; quantities update live and correctly.
- Ortho-lock constrains to right angles; snapping attaches endpoints predictably.
- Switching the active condition routes subsequent measurements to the new condition.

**Caveats**

- Vertex editing on dense drawings must remain precise; provide zoom-to-vertex affordances.
- Decide and document behavior for self-intersecting polygons (reject or auto-correct) so areas are never ambiguous.

---

## P1-10 — Conditions, units, and factors

**Depends on:** P0-10, P1-08

**Implementation details**

- Implement `Condition` CRUD with trade category, measurement type, unit, color, waste factor, optional depth/height for derived volume/surface area, and optional unit cost.
- Enforce that derivations (area→volume, length→wall area) are explicit on the condition.

**Test scenarios**

- Creating conditions of each measurement type with correct units works; invalid type/unit combinations are rejected.
- A waste factor and a derived volume compute correctly from the base quantity.
- Optional unit cost produces an extended cost.

**Caveats**

- Never silently assume a derivation; an area condition is not a volume condition unless the user sets a depth.

---

## P1-11 — Server-authoritative quantity rollups · GATE

**Depends on:** P1-09, P1-10

**Implementation details**

- Compute `QuantityRollup` server-side from the authoritative measurement set whenever measurements change; the client displays cached values and a recomputing state when stale.
- Recompute base quantity, quantity-with-waste, derived volume/surface area, extended cost, and measurement count.

**Test scenarios**

- Adding, editing, and deleting measurements updates the rollup to the correct value every time.
- A client that sends a tampered quantity cannot influence the stored rollup (server ignores client-side totals).
- Concurrent edits from two users converge to the correct authoritative total.

**Caveats**

- The client must never be the source of truth for quantities; this is both a correctness and an anti-tampering requirement.
- Recompute must be efficient on conditions with many measurements; debounce or batch rather than recomputing per vertex.

---

## P1-12 — Undo/redo

**Depends on:** P1-09

**Implementation details**

- Implement session-scoped undo/redo across all editing actions (create, edit, delete, reclassify), reconciling with server confirmations.

**Test scenarios**

- A sequence of mixed edits undoes and redoes in correct order with quantities staying consistent.
- Undo after a failed server sync leaves a consistent state.

**Caveats**

- Optimistic edits that later fail to persist must be reconciled, not left as phantom geometry.

---

## P1-13 — Reports & exports

**Depends on:** P1-11

**Implementation details**

- Build report generation in `worker-exports` for summary, detailed, by-trade, and marked-plans templates; run as background jobs; store artifacts and deliver via signed expiring URLs.
- Record each export as a `Report`; meter usage when beyond plan quota.

**Test scenarios**

- Each template generates and downloads correctly with accurate grouping.
- Marked-plans export burns the overlay onto the correct sheets at the correct positions.
- A large takeoff exports without timing out (background job, not inline).

**Caveats**

- Exported numbers must equal the rollups exactly; exports never recompute independently. Add a test that compares exported totals to `QuantityRollup`.

---

## P1-14 — Export-vs-rollup parity · GATE

**Depends on:** P1-13

**Implementation details**

- Add an automated check that, for a representative takeoff, every number in every export format matches the authoritative rollup to full precision before display rounding.

**Test scenarios**

- Summary, detailed, by-trade, and spreadsheet exports all reconcile to the rollup totals.
- A deliberately introduced rounding discrepancy is caught by the parity test.

**Caveats**

- Display rounding and stored precision differ; the parity check compares pre-rounding values to avoid false mismatches while still catching real ones.

---

## Phase 1 completion check

- [ ] Upload → process → view works with granular progress
- [ ] Viewer holds the performance budget (P1-06 gate)
- [ ] Geometry/scale math is exhaustively tested
- [ ] Manual tools produce correct, editable measurements
- [ ] Rollups are server-authoritative and tamper-proof (P1-11 gate)
- [ ] Exports match rollups exactly (P1-14 gate)
