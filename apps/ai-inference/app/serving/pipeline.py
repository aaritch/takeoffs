"""
Per-sheet inference pipeline (P2-02 skeleton). Runs the staged pipeline for one sheet and returns a
``SheetInferenceResult`` (the P2-01 contract: modelRunId, sheetId, status, classification, scale,
candidates, errorDetail).

SKELETON: a NO-OP pipeline — it resolves + records the pinned model versions and returns an empty
candidate set with status ``SUCCEEDED``. The real staged detectors (classify/OCR/scale → line/area →
symbol, P2-04/06/07) plug in here behind the same result contract; P2-03 adds per-stage persistence
so any stage can re-run and a per-sheet stage failure yields ``PARTIAL`` instead of a dead set.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .model_registry import ModelRegistry, PinnedVersions


@dataclass(frozen=True)
class SheetRunOutcome:
    """A sheet's result plus the pinned versions it ran with (for the run's lineage)."""

    result: dict[str, Any]
    pinned: PinnedVersions


def run_sheet(job: dict[str, Any], registry: ModelRegistry) -> SheetRunOutcome:
    pinned = registry.resolve(job.get("modelVersions", {}))
    result: dict[str, Any] = {
        "modelRunId": job["modelRunId"],
        "sheetId": job["sheetId"],
        "status": "SUCCEEDED",
        "classification": None,
        "scale": None,
        "candidates": [],  # no-op pipeline: no detections until real detectors land
        "errorDetail": None,
    }
    return SheetRunOutcome(result=result, pinned=pinned)
