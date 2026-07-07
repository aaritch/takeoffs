"""Inference worker skeleton tests (P2-02) — the queue→worker→result path, no Redis/GPU needed."""

from __future__ import annotations

import pytest

from app.serving.model_registry import SKELETON_PIPELINE_VERSION, ModelRegistry
from app.serving.pipeline import run_sheet
from app.serving.worker import Worker


class FakeSource:
    def __init__(self, jobs):
        self._jobs = list(jobs)

    def next(self):
        return self._jobs.pop(0) if self._jobs else None


class FakeSink:
    def __init__(self):
        self.published = []

    def publish(self, result):
        self.published.append(result)


def _job(**over):
    job = {
        "correlationId": "corr-1",
        "modelRunId": "019f0000-0000-7000-8000-0000000000a1",
        "orgId": "019f0000-0000-7000-8000-0000000000b1",
        "sheetId": "019f0000-0000-7000-8000-0000000000c1",
        "planSetId": "019f0000-0000-7000-8000-0000000000d1",
        "pipelineVersion": "p-1",
        "modelVersions": {"classify": "1.0", "scale": "2.1"},
    }
    job.update(over)
    return job


def test_picks_up_job_runs_noop_pipeline_and_publishes_result():
    source = FakeSource([_job()])
    sink = FakeSink()

    processed = Worker(source, sink).run(stop_when_empty=True)

    assert processed == 1
    assert len(sink.published) == 1
    result = sink.published[0]
    # A valid SheetInferenceResult from the no-op pipeline: the sheet ran, no detections yet.
    assert result["modelRunId"] == _job()["modelRunId"]
    assert result["sheetId"] == _job()["sheetId"]
    assert result["status"] == "SUCCEEDED"
    assert result["candidates"] == []
    assert result["classification"] is None and result["scale"] is None


def test_records_the_pinned_versions_for_lineage():
    outcome = run_sheet(_job(modelVersions={"symbol": "3.4"}), ModelRegistry())
    # The run's lineage: the skeleton pipeline version + the versions the job pinned, echoed back.
    assert outcome.pinned.pipeline_version == SKELETON_PIPELINE_VERSION
    assert outcome.pinned.model_versions == {"symbol": "3.4"}


def test_rejects_a_malformed_job_rather_than_producing_a_bad_result():
    source = FakeSource([{"modelRunId": "only-this"}])
    with pytest.raises(ValueError, match="missing required fields"):
        Worker(source, FakeSink()).run(stop_when_empty=True)


def test_drains_multiple_jobs_then_stops_when_empty():
    source = FakeSource([_job(sheetId="s-a"), _job(sheetId="s-b"), _job(sheetId="s-c")])
    sink = FakeSink()
    assert Worker(source, sink).run(stop_when_empty=True) == 3
    assert [r["sheetId"] for r in sink.published] == ["s-a", "s-b", "s-c"]


def test_selftest_entrypoint_runs_one_job_and_exits_zero():
    from app.serving.__main__ import main

    assert main(["--selftest"]) == 0
