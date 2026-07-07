"""
Training entrypoint (P4-05). Real per-family model runtimes (detectors, OCR, etc.) land with the GPU
compute home; until then this is a **deterministic baseline trainer** that exercises the whole
pipeline end to end without a GPU: it learns, per discipline, the majority label class observed in the
assembled dataset, and predicts that class for a benchmark example of the same discipline.

That is a legitimate (if simple) model: its metrics genuinely depend on the training data (so a
different/opt-out-filtered dataset yields different metrics — the point of the gate), it is fully
deterministic (stable tests), and it records the dataset version + originating base version it was
built from (lineage). A real trainer swaps in behind the same `train(...) -> CandidateModel` seam.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from ..datasets.records import Dataset
from ..evaluation.benchmark import Benchmark
from ..evaluation.metrics import Prediction


@dataclass(frozen=True)
class CandidateModel:
    model_family: str
    version: str
    dataset_version: str
    base_version: str | None
    trained_example_count: int
    # discipline -> predicted class (the learned majority per discipline).
    discipline_class: dict[str, str] = field(default_factory=dict)
    # Fallback class for a discipline unseen in training (the overall majority), or None if empty.
    fallback_class: str | None = None

    def predict(self, benchmark: Benchmark) -> list[Prediction]:
        preds: list[Prediction] = []
        for example in benchmark.examples:
            cls = self.discipline_class.get(example.discipline, self.fallback_class)
            if cls is not None:
                preds.append(Prediction(key=example.key, predicted_class=cls))
        return preds


def _majority(labels: list[str]) -> str | None:
    if not labels:
        return None
    counts = Counter(labels)
    top = max(counts.values())
    # Deterministic tie-break: lexicographically smallest class among the most frequent.
    return sorted(cls for cls, n in counts.items() if n == top)[0]


def train(
    dataset: Dataset,
    *,
    model_family: str,
    version: str,
    base_version: str | None = None,
) -> CandidateModel:
    family_examples = [e for e in dataset.examples if e.model_family == model_family]

    by_discipline: dict[str, list[str]] = {}
    for e in family_examples:
        by_discipline.setdefault(e.discipline, []).append(e.label_class)

    discipline_class = {
        disc: cls
        for disc, labels in by_discipline.items()
        if (cls := _majority(labels)) is not None
    }
    fallback = _majority([e.label_class for e in family_examples])

    return CandidateModel(
        model_family=model_family,
        version=version,
        dataset_version=dataset.version,
        base_version=base_version,
        trained_example_count=len(family_examples),
        discipline_class=discipline_class,
        fallback_class=fallback,
    )
