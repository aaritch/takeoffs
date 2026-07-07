"""End-to-end training pipeline (P4-05 · GATE): the three card scenarios + the leak guard."""

import pytest

from takeoff_ml import run_training_pipeline
from takeoff_ml.datasets import FeedbackExample
from takeoff_ml.datasets.assembly import assemble_dataset
from takeoff_ml.evaluation import Benchmark, BenchmarkExample, BenchmarkLeakError, assert_no_leak


def fx(fid, org, disc, cls, *, family="classify", key=None, action="ACCEPT", ver="classify-1"):
    return FeedbackExample(
        feedback_id=fid,
        org_id=org,
        model_family=family,
        discipline=disc,
        label_class=cls,
        action=action,
        model_version=ver,
        source_key=key,
    )


def a_benchmark():
    return Benchmark(
        benchmark_id="frozen-v1",
        examples=(
            BenchmarkExample("b1", "CONCRETE", "SLAB"),
            BenchmarkExample("b2", "CONCRETE", "SLAB"),
            BenchmarkExample("b3", "ELECTRICAL", "OUTLET"),
        ),
    )


def test_scenario1_run_consumes_a_versioned_dataset_and_produces_a_candidate_with_metrics():
    feedback = [
        fx("f1", "o", "CONCRETE", "SLAB", key="t1"),
        fx("f2", "o", "CONCRETE", "SLAB", key="t2"),
        fx("f3", "o", "ELECTRICAL", "OUTLET", key="t3"),
    ]
    result = run_training_pipeline(
        feedback,
        a_benchmark(),
        model_family="classify",
        version="classify-2.0.0",
        dataset_version="ds-2026-07",
        base_version="classify-1.0.0",
    )
    assert result.candidate.version == "classify-2.0.0"
    assert result.candidate.dataset_version == "ds-2026-07"
    assert result.candidate.base_version == "classify-1.0.0"  # lineage recorded
    assert result.dataset.manifest.content_hash  # the dataset is versioned/reproducible
    # The learned per-discipline majority perfectly labels this benchmark → metrics present + high.
    assert result.report.accuracy == 1.0
    assert result.registration_payload["modelFamily"] == "classify"
    assert result.registration_payload["benchmarkId"] == "frozen-v1"
    assert result.registration_payload["metrics"]["accuracy"] == 1.0


def test_scenario2_evaluation_reports_per_class_and_per_discipline_metrics():
    feedback = [
        fx("f1", "o", "CONCRETE", "SLAB", key="t1"),
        fx("f2", "o", "ELECTRICAL", "OUTLET", key="t2"),
    ]
    result = run_training_pipeline(
        feedback,
        a_benchmark(),
        model_family="classify",
        version="v2",
        dataset_version="ds1",
    )
    flat = result.registration_payload["metrics"]
    assert any(k.startswith("class.") and k.endswith(".f1") for k in flat)
    assert "discipline.CONCRETE.accuracy" in flat
    assert "discipline.ELECTRICAL.accuracy" in flat


def test_scenario3_opted_out_org_data_is_absent_end_to_end():
    # The opted-out org would push the CONCRETE majority to FOOTING (wrong for the SLAB benchmark);
    # excluding it must both drop the data AND change the learned model's output.
    feedback = [
        fx("f1", "keep", "CONCRETE", "SLAB", key="t1"),
        fx("f2", "out", "CONCRETE", "FOOTING", key="t2"),
        fx("f3", "out", "CONCRETE", "FOOTING", key="t3"),
    ]
    result = run_training_pipeline(
        feedback,
        a_benchmark(),
        model_family="classify",
        version="v2",
        dataset_version="ds1",
        opted_out_orgs=["out"],
    )
    # Verifiably absent: no provenance from the opted-out org, and only the kept example remains.
    assert result.dataset.source_keys() == {"t1"}
    assert all(p.org_id != "out" for p in result.dataset.manifest.provenance)
    # And the model learned SLAB for CONCRETE (from the kept org), not FOOTING.
    assert result.candidate.discipline_class["CONCRETE"] == "SLAB"


def test_benchmark_leak_is_excluded_by_assembly_and_caught_by_the_guard():
    # Assembly drops a training key that collides with the benchmark…
    feedback = [fx("f1", "o", "CONCRETE", "SLAB", key="b1"), fx("f2", "o", "CONCRETE", "SLAB", key="t1")]
    result = run_training_pipeline(
        feedback, a_benchmark(), model_family="classify", version="v2", dataset_version="ds1"
    )
    assert "b1" not in result.dataset.source_keys()
    assert result.dataset.manifest.excluded_benchmark == 1

    # …and the independent guard fails closed if a leak ever slips through assembly.
    leaked = assemble_dataset(feedback, version="v1")  # no benchmark filter applied
    with pytest.raises(BenchmarkLeakError):
        assert_no_leak(leaked.source_keys(), a_benchmark())
