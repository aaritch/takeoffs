# ml/

Offline model lifecycle — **not** in the request path. Python. Lands in Phase 4 (training,
evaluation, promotion), though datasets/labeling thinking starts alongside Phase 2.

| Subfolder     | Purpose                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `datasets/`   | Dataset assembly from `DetectionFeedback`, manifests, versioning. Honors org training opt-outs. |
| `labeling/`   | Labeling guidelines, schema, import/export.                                                     |
| `training/`   | Training configs and entrypoints per model family.                                              |
| `evaluation/` | The **frozen benchmark set**, metrics, promotion checks.                                        |
| `registry/`   | Model registry integration, version metadata.                                                   |
| `notebooks/`  | Exploration only — never imported by services.                                                  |

Invariants: never touch the request path, never train on opted-out data, and never promote
a model that regresses the frozen benchmark.

## Implementation (P4-05)

The pipeline lives in the importable **`takeoff_ml`** package (`pip install -e ".[dev]"`, `pytest`):

- `takeoff_ml/datasets/` — `assemble_dataset(...)`: opt-out + benchmark-leak exclusion, provenance,
  deterministic versioning (content hash).
- `takeoff_ml/evaluation/` — the frozen `Benchmark` + pure `evaluate(...)` metrics (per-class P/R/F1,
  per-discipline accuracy) and the `assert_no_leak` guard.
- `takeoff_ml/training/` — `train(...)`: a deterministic per-discipline majority baseline (a real
  per-family runtime swaps in behind the same seam once the GPU compute home exists).
- `takeoff_ml/registry/` — shapes an evaluated candidate as the app-plane `RegisterModelVersionRequest`
  (P4-06); the registry's non-regression gate then decides promotion.
- `takeoff_ml/pipeline.py` — `run_training_pipeline(...)` ties them together.

The opt-out itself is a real app-plane setting: `organizations.training_opt_out` (OWNER-gated via
`PATCH /v1/org/training-preferences`); the offline exporter reads `accountsService.listOptedOutOrgIds`
and passes the set to assembly. `labeling/` and `notebooks/` land when needed.
