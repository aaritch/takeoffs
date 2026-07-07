"""
Registry hand-off (P4-05 → P4-06). Shapes an evaluated candidate as the exact payload the app-plane
model registry expects at `POST /v1/ops/models` (contracts `RegisterModelVersionRequest`): the family,
version, the flat higher-is-better metrics, and the benchmark id they were measured against. The
app-plane `promote` step then applies the non-regression gate against the current ACTIVE version — so
the offline pipeline proposes, and the registry disposes.
"""

from __future__ import annotations

from ..evaluation.metrics import EvaluationReport
from ..training.trainer import CandidateModel


def registration_payload(
    candidate: CandidateModel,
    report: EvaluationReport,
    *,
    notes: str | None = None,
) -> dict:
    payload = {
        "modelFamily": candidate.model_family,
        "version": candidate.version,
        "metrics": report.flat_metrics(),
        "benchmarkId": report.benchmark_id,
    }
    if notes is not None:
        payload["notes"] = notes
    return payload
