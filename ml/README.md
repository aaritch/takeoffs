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
