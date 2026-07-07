"""
Offline model lifecycle (P4-05) — dataset assembly → training → evaluation → a promotion payload for
the app-plane model registry (P4-06). Fully offline: this package NEVER runs on the request path.

Two invariants are enforced in code, not just documented:
- **Opt-out** — an org that opted out of training has NO example in any assembled dataset.
- **Frozen benchmark** — the held-out benchmark set never leaks into training; a candidate is
  evaluated only against it, so its metrics are meaningful.
"""

from .pipeline import TrainingRunResult, run_training_pipeline

__all__ = ["run_training_pipeline", "TrainingRunResult"]
