"""
Evaluation metrics (P4-05). Pure, exhaustively tested — wrong numbers hide here, and these numbers
drive the P4-06 promotion gate, so they must be exact.

Given predictions for the benchmark examples, we compute, per model family's needs:
- **per-class** precision / recall / F1 (one-vs-rest over every class in truth ∪ predictions),
- **per-discipline** accuracy (trade-level correctness),
- overall accuracy and macro-averaged precision/recall/F1.

Every metric is higher-is-better and in [0, 1], so `flat_metrics` plugs straight into the app-plane
`nonRegresses` gate (a candidate promotes only if it regresses none of them).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from .benchmark import Benchmark


@dataclass(frozen=True)
class Prediction:
    key: str
    predicted_class: str


@dataclass(frozen=True)
class ClassMetrics:
    precision: float
    recall: float
    f1: float
    support: int


@dataclass(frozen=True)
class EvaluationReport:
    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    per_class: dict[str, ClassMetrics]
    per_discipline_accuracy: dict[str, float]
    evaluated_count: int
    benchmark_id: str

    def flat_metrics(self) -> dict[str, float]:
        """A flat {metric: score} map (all higher-is-better) for the registry / non-regression gate."""

        out: dict[str, float] = {
            "accuracy": self.accuracy,
            "macro_precision": self.macro_precision,
            "macro_recall": self.macro_recall,
            "macro_f1": self.macro_f1,
        }
        for cls, m in self.per_class.items():
            out[f"class.{cls}.precision"] = m.precision
            out[f"class.{cls}.recall"] = m.recall
            out[f"class.{cls}.f1"] = m.f1
        for disc, acc in self.per_discipline_accuracy.items():
            out[f"discipline.{disc}.accuracy"] = acc
        return out


def _safe_div(num: float, den: float) -> float:
    return num / den if den else 0.0


def evaluate(predictions: list[Prediction], benchmark: Benchmark) -> EvaluationReport:
    """Score `predictions` against the frozen `benchmark`. A missing prediction counts as wrong."""

    truth = {e.key: e for e in benchmark.examples}
    pred_by_key = {p.key: p.predicted_class for p in predictions}

    classes = {e.label_class for e in benchmark.examples} | set(pred_by_key.values())
    tp: dict[str, int] = defaultdict(int)
    fp: dict[str, int] = defaultdict(int)
    fn: dict[str, int] = defaultdict(int)

    correct = 0
    disc_total: dict[str, int] = defaultdict(int)
    disc_correct: dict[str, int] = defaultdict(int)

    for key, example in truth.items():
        actual = example.label_class
        # A benchmark example with no prediction is scored as an (unmatched) miss, never skipped.
        predicted = pred_by_key.get(key)
        disc_total[example.discipline] += 1
        if predicted == actual:
            correct += 1
            tp[actual] += 1
            disc_correct[example.discipline] += 1
        else:
            fn[actual] += 1
            if predicted is not None:
                fp[predicted] += 1

    per_class: dict[str, ClassMetrics] = {}
    for cls in sorted(classes):
        precision = _safe_div(tp[cls], tp[cls] + fp[cls])
        recall = _safe_div(tp[cls], tp[cls] + fn[cls])
        f1 = _safe_div(2 * precision * recall, precision + recall)
        per_class[cls] = ClassMetrics(
            precision=precision, recall=recall, f1=f1, support=tp[cls] + fn[cls]
        )

    total = len(truth)
    macro_p = _safe_div(sum(m.precision for m in per_class.values()), len(per_class))
    macro_r = _safe_div(sum(m.recall for m in per_class.values()), len(per_class))
    macro_f1 = _safe_div(sum(m.f1 for m in per_class.values()), len(per_class))

    return EvaluationReport(
        accuracy=_safe_div(correct, total),
        macro_precision=macro_p,
        macro_recall=macro_r,
        macro_f1=macro_f1,
        per_class=per_class,
        per_discipline_accuracy={
            d: _safe_div(disc_correct[d], disc_total[d]) for d in sorted(disc_total)
        },
        evaluated_count=total,
        benchmark_id=benchmark.benchmark_id,
    )
