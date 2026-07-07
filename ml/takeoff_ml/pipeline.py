"""
The offline training pipeline (P4-05 · GATE). One call takes exported feedback + the frozen benchmark
and produces an evaluated candidate ready to register with the app-plane model registry (P4-06):

    assemble  →  assert-no-leak  →  train  →  predict on benchmark  →  evaluate  →  registration payload

Every step is deterministic and the two invariants are enforced in code: an opted-out org's data
never enters the dataset (assembly), and the frozen benchmark never leaks into training (assembly
exclusion + a redundant `assert_no_leak` guard). This module never runs on the request path.
"""

from __future__ import annotations

from dataclasses import dataclass

from .datasets.assembly import assemble_dataset
from .datasets.records import Dataset, FeedbackExample
from .evaluation.benchmark import Benchmark, assert_no_leak
from .evaluation.metrics import EvaluationReport, evaluate
from .registry.candidate import registration_payload
from .training.trainer import CandidateModel, train


@dataclass(frozen=True)
class TrainingRunResult:
    dataset: Dataset
    candidate: CandidateModel
    report: EvaluationReport
    registration_payload: dict


def run_training_pipeline(
    feedback: list[FeedbackExample],
    benchmark: Benchmark,
    *,
    model_family: str,
    version: str,
    dataset_version: str,
    base_version: str | None = None,
    opted_out_orgs: list[str] | None = None,
) -> TrainingRunResult:
    dataset = assemble_dataset(
        feedback,
        version=dataset_version,
        opted_out_orgs=opted_out_orgs or (),
        benchmark_keys=benchmark.keys(),
    )
    # Redundant with assembly's benchmark exclusion — kept as a fail-closed guard so a future change to
    # assembly can never silently contaminate the benchmark.
    assert_no_leak(dataset.source_keys(), benchmark)

    candidate = train(
        dataset, model_family=model_family, version=version, base_version=base_version
    )
    report = evaluate(candidate.predict(benchmark), benchmark)
    payload = registration_payload(
        candidate,
        report,
        notes=f"dataset={dataset.version} base={base_version or 'none'} n={candidate.trained_example_count}",
    )
    return TrainingRunResult(
        dataset=dataset, candidate=candidate, report=report, registration_payload=payload
    )
