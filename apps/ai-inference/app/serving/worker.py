"""
The inference worker (P2-02). Pulls an ``InferenceJob``, runs the pipeline for its sheet, and
publishes the ``SheetInferenceResult``. The job source + result sink are Protocols (seams) so the
worker is unit-tested with in-memory fakes and deployed against Redis without changing this logic.
"""

from __future__ import annotations

import logging
from typing import Any, Protocol

from .model_registry import ModelRegistry
from .pipeline import run_sheet

log = logging.getLogger("takeoff.inference")

# The fields the app-plane stamps on every InferenceJob (mirrors @takeoff/contracts jobs/inference).
REQUIRED_JOB_FIELDS = (
    "modelRunId",
    "orgId",
    "sheetId",
    "planSetId",
    "pipelineVersion",
    "modelVersions",
)


class JobSource(Protocol):
    def next(self) -> dict[str, Any] | None:
        """Return the next job, or None when none is available (a blocking source waits instead)."""


class ResultSink(Protocol):
    def publish(self, result: dict[str, Any]) -> None:
        """Hand a SheetInferenceResult back toward the app plane for authoritative ingestion."""


class Worker:
    def __init__(
        self,
        source: JobSource,
        sink: ResultSink,
        registry: ModelRegistry | None = None,
    ) -> None:
        self._source = source
        self._sink = sink
        self._registry = registry or ModelRegistry()

    def process_one(self) -> dict[str, Any] | None:
        """Process a single job. Returns the published result, or None if no job was available."""
        job = self._source.next()
        if job is None:
            return None
        missing = [f for f in REQUIRED_JOB_FIELDS if f not in job]
        if missing:
            raise ValueError(f"InferenceJob is missing required fields: {missing}")

        outcome = run_sheet(job, self._registry)
        log.info(
            "sheet inference complete",
            extra={
                "modelRunId": job["modelRunId"],
                "sheetId": job["sheetId"],
                "pipelineVersion": outcome.pinned.pipeline_version,
                "modelVersions": outcome.pinned.model_versions,
                "status": outcome.result["status"],
                "candidateCount": len(outcome.result["candidates"]),
            },
        )
        self._sink.publish(outcome.result)
        return outcome.result

    def run(self, max_jobs: int | None = None, stop_when_empty: bool = False) -> int:
        """
        Drain jobs. `stop_when_empty=False` (the deployed default) keeps polling forever — a blocking
        source waits inside `next()`, so this is idle, not a busy loop. `stop_when_empty=True` returns
        once the source is drained (used by tests + one-shot runs). Returns the count processed.
        """
        processed = 0
        while max_jobs is None or processed < max_jobs:
            result = self.process_one()
            if result is None:
                if stop_when_empty:
                    break
                continue
            processed += 1
        return processed
