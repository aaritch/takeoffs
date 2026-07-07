"""
Per-sheet stage orchestration (P2-03). Runs the pipeline stages for one sheet IN ORDER, persisting
each stage's output so any stage can be re-run independently, and — on a stage failure — records the
error, marks the sheet FAILED, and skips the downstream stages that depend on it (rather than
crashing the whole run). Each sheet is processed independently (one InferenceJob per sheet), so a
failure on one sheet never touches another; the app aggregates the per-sheet outcomes into the
ModelRun status (SUCCEEDED / PARTIAL / FAILED — see the TS `deriveRunStatus`).

The stages themselves are injected (a name→callable registry), so the orchestration logic is tested
with stubs — including a deliberately failing stage — before the real detectors (P2-04/06/07) exist.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

# Canonical stage order — mirrors @takeoff/contracts STAGE_ORDER (P2-01).
STAGE_ORDER: list[str] = [
    "CLASSIFY",
    "OCR",
    "SCALE",
    "LINES",
    "REGIONS",
    "SYMBOLS",
    "VECTORIZE",
    "MAP",
    "QUANTIFY",
    "CONFIDENCE",
]


@dataclass
class SheetContext:
    """Accumulating per-sheet state: a stage reads prior stages' outputs and writes its own."""

    job: dict[str, Any]
    outputs: dict[str, Any] = field(default_factory=dict)


# A stage transforms the context and returns its (persisted) output. Raising = a stage failure.
Stage = Callable[[SheetContext], Any]


@dataclass
class StageRun:
    stage: str
    status: str  # "SUCCEEDED" | "FAILED" | "SKIPPED"
    error: str | None = None


@dataclass
class SheetInference:
    status: str  # "SUCCEEDED" | "FAILED" (a ModelRunStatus for this sheet)
    stages: list[StageRun]
    outputs: dict[str, Any]
    error_detail: str | None


class Orchestrator:
    def __init__(self, stages: dict[str, Stage], order: list[str] | None = None) -> None:
        self._stages = stages
        self._order = order or STAGE_ORDER

    def run_sheet(self, job: dict[str, Any]) -> SheetInference:
        ctx = SheetContext(job=job)
        runs: list[StageRun] = []
        error_detail: str | None = None
        aborted = False

        for name in self._order:
            stage = self._stages.get(name)
            if aborted or stage is None:
                # A stage is skipped either because an upstream stage failed, or because it isn't
                # wired yet (no detector for it) — both are non-fatal, recorded as SKIPPED.
                runs.append(StageRun(name, "SKIPPED"))
                continue
            try:
                ctx.outputs[name] = stage(ctx)  # persist the output → re-runnable independently
                runs.append(StageRun(name, "SUCCEEDED"))
            except Exception as exc:  # a single stage failing must not crash the whole run
                error_detail = f"{name}: {exc}"
                runs.append(StageRun(name, "FAILED", error=str(exc)))
                aborted = True

        return SheetInference(
            status="FAILED" if aborted else "SUCCEEDED",
            stages=runs,
            outputs=dict(ctx.outputs),
            error_detail=error_detail,
        )


def derive_run_status(sheet_statuses: list[str]) -> str:
    """
    Aggregate per-sheet statuses into a ModelRun status (mirrors the TS `deriveRunStatus`, kept here
    for the batch path): all SUCCEEDED → SUCCEEDED, all FAILED → FAILED, any mix → PARTIAL. An empty
    set is FAILED (nothing produced).
    """
    if not sheet_statuses:
        return "FAILED"
    if all(s == "SUCCEEDED" for s in sheet_statuses):
        return "SUCCEEDED"
    if all(s == "FAILED" for s in sheet_statuses):
        return "FAILED"
    return "PARTIAL"
