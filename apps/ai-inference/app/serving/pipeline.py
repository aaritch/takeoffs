"""
Per-sheet inference pipeline (P2-02/03). Runs the orchestrated stage pipeline for one sheet and
returns a ``SheetInferenceResult`` (the P2-01 contract: modelRunId, sheetId, status, classification,
scale, candidates, errorDetail), plus the pinned versions the run used (lineage).

The orchestration (run stages in order, persist each output, isolate + record a stage failure) is
P2-03; the actual staged DETECTORS (classify/OCR/scale → line/area → symbol, P2-04/06/07) are the
injected stages. With no detectors wired yet the pipeline is a valid no-op (every stage SKIPPED →
status SUCCEEDED, no candidates); a failing stage yields a FAILED sheet with error detail.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .model_registry import ModelRegistry, PinnedVersions
from .orchestrator import Orchestrator, SheetInference, Stage


def default_stages() -> dict[str, Stage]:
    """The stages wired today. Empty until the real detectors (P2-04/06/07) land — the deterministic
    post-processors (P2-08) run once probabilistic detections feed them."""
    return {}


@dataclass(frozen=True)
class SheetRunOutcome:
    """A sheet's result (SheetInferenceResult), the pinned versions it ran with, and the stage log."""

    result: dict[str, Any]
    pinned: PinnedVersions
    inference: SheetInference


def run_sheet(
    job: dict[str, Any],
    registry: ModelRegistry,
    stages: dict[str, Stage] | None = None,
) -> SheetRunOutcome:
    pinned = registry.resolve(job.get("modelVersions", {}))
    inference = Orchestrator(default_stages() if stages is None else stages).run_sheet(job)

    result: dict[str, Any] = {
        "modelRunId": job["modelRunId"],
        "sheetId": job["sheetId"],
        "status": inference.status,
        "classification": inference.outputs.get("CLASSIFY"),
        "scale": inference.outputs.get("SCALE"),
        # Candidates are the scored output of the final CONFIDENCE stage (empty until detectors land).
        "candidates": inference.outputs.get("CONFIDENCE") or [],
        "errorDetail": inference.error_detail,
    }
    return SheetRunOutcome(result=result, pinned=pinned, inference=inference)
