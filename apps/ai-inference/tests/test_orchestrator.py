"""Pipeline orchestration + partial-failure tests (P2-03)."""

from __future__ import annotations

import pytest

from app.serving.model_registry import ModelRegistry
from app.serving.orchestrator import Orchestrator, SheetContext, derive_run_status
from app.serving.pipeline import run_sheet


def _job(**over):
    job = {
        "correlationId": "c",
        "modelRunId": "019f0000-0000-7000-8000-0000000000a1",
        "orgId": "019f0000-0000-7000-8000-0000000000b1",
        "sheetId": "019f0000-0000-7000-8000-0000000000c1",
        "planSetId": "019f0000-0000-7000-8000-0000000000d1",
        "pipelineVersion": "p-1",
        "modelVersions": {},
    }
    job.update(over)
    return job


def test_runs_stages_in_order_persisting_each_output():
    seen = []

    def make(name):
        def stage(ctx: SheetContext):
            seen.append(name)
            return {"stage": name}

        return stage

    stages = {"CLASSIFY": make("CLASSIFY"), "OCR": make("OCR"), "SCALE": make("SCALE")}
    inf = Orchestrator(stages).run_sheet(_job())

    assert inf.status == "SUCCEEDED"
    assert seen == ["CLASSIFY", "OCR", "SCALE"]  # canonical order
    # every stage's output is persisted (re-runnable / readable by later stages)
    assert inf.outputs["CLASSIFY"] == {"stage": "CLASSIFY"}
    assert inf.outputs["SCALE"] == {"stage": "SCALE"}


def test_a_stage_failure_marks_the_sheet_failed_and_skips_downstream_but_keeps_upstream():
    def ok(ctx):
        return "ok"

    def boom(ctx):
        raise RuntimeError("model timeout")

    ran_after = []

    def later(ctx):
        ran_after.append(True)
        return "late"

    stages = {"CLASSIFY": ok, "OCR": boom, "SCALE": later}
    inf = Orchestrator(stages).run_sheet(_job())

    assert inf.status == "FAILED"
    assert inf.error_detail == "OCR: model timeout"  # names the failing stage
    assert inf.outputs["CLASSIFY"] == "ok"  # upstream output preserved
    assert "OCR" not in inf.outputs and "SCALE" not in inf.outputs
    assert ran_after == []  # downstream stage was skipped, not run
    by_stage = {s.stage: s.status for s in inf.stages}
    assert by_stage["CLASSIFY"] == "SUCCEEDED"
    assert by_stage["OCR"] == "FAILED"
    assert by_stage["SCALE"] == "SKIPPED"


def test_a_later_stage_can_read_an_earlier_stages_output():
    def classify(ctx):
        return "PLAN"

    def route(ctx):
        # downstream stage depends on the persisted upstream output
        assert ctx.outputs["CLASSIFY"] == "PLAN"
        return "routed"

    inf = Orchestrator({"CLASSIFY": classify, "OCR": route}).run_sheet(_job())
    assert inf.status == "SUCCEEDED"
    assert inf.outputs["OCR"] == "routed"


def test_sheets_are_independent_one_failing_does_not_affect_another():
    good = run_sheet(_job(sheetId="s-good"), ModelRegistry(), stages={"CLASSIFY": lambda c: "ok"})
    bad = run_sheet(
        _job(sheetId="s-bad"),
        ModelRegistry(),
        stages={"CLASSIFY": lambda c: (_ for _ in ()).throw(ValueError("bad sheet"))},
    )
    assert good.result["status"] == "SUCCEEDED"
    assert bad.result["status"] == "FAILED"
    assert bad.result["errorDetail"].startswith("CLASSIFY:")
    # candidates come from the CONFIDENCE stage; empty when it didn't run
    assert good.result["candidates"] == []


def test_run_sheet_surfaces_confidence_candidates_and_classification():
    stages = {
        "CLASSIFY": lambda c: {"pageType": "PLAN", "discipline": "A"},
        "CONFIDENCE": lambda c: [{"id": "cand-1"}],
    }
    out = run_sheet(_job(), ModelRegistry(), stages=stages)
    assert out.result["status"] == "SUCCEEDED"
    assert out.result["classification"] == {"pageType": "PLAN", "discipline": "A"}
    assert out.result["candidates"] == [{"id": "cand-1"}]


def test_derive_run_status_aggregates_per_sheet_outcomes():
    assert derive_run_status(["SUCCEEDED", "SUCCEEDED"]) == "SUCCEEDED"
    assert derive_run_status(["SUCCEEDED", "FAILED"]) == "PARTIAL"  # one sheet failed → PARTIAL run
    assert derive_run_status(["FAILED", "FAILED"]) == "FAILED"
    assert derive_run_status([]) == "FAILED"


@pytest.mark.parametrize("bad", [{"CLASSIFY": None}])
def test_missing_stage_is_skipped_not_fatal(bad):
    # a stage name with no callable (detector not wired) is skipped, run still succeeds
    inf = Orchestrator({}).run_sheet(_job())
    assert inf.status == "SUCCEEDED"
    assert all(s.status == "SKIPPED" for s in inf.stages)
