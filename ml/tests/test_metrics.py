"""Evaluation metrics (P4-05): exact per-class P/R/F1, per-discipline accuracy, edge cases."""

import math

from takeoff_ml.evaluation import Benchmark, BenchmarkExample, Prediction, evaluate


def bench(*rows):
    # rows: (key, discipline, label_class)
    return Benchmark(
        benchmark_id="bench-1",
        examples=tuple(BenchmarkExample(k, d, c) for k, d, c in rows),
    )


def test_perfect_predictions_score_one_everywhere():
    b = bench(("k1", "CONCRETE", "SLAB"), ("k2", "CONCRETE", "FOOTING"))
    preds = [Prediction("k1", "SLAB"), Prediction("k2", "FOOTING")]
    r = evaluate(preds, b)
    assert r.accuracy == 1.0
    assert r.macro_f1 == 1.0
    assert r.per_discipline_accuracy == {"CONCRETE": 1.0}


def test_all_wrong_scores_zero():
    b = bench(("k1", "D", "A"), ("k2", "D", "A"))
    r = evaluate([Prediction("k1", "B"), Prediction("k2", "B")], b)
    assert r.accuracy == 0.0
    assert r.per_class["A"].recall == 0.0
    assert r.per_class["B"].precision == 0.0


def test_precision_recall_f1_are_exact_for_a_mixed_case():
    # Truth: 3×A, 1×B. Predict A for k1,k2 (correct), A for k3 (truth B → FP for A, FN for B),
    # B for k4 (truth A → FP for B, FN for A).
    b = bench(
        ("k1", "D", "A"),
        ("k2", "D", "A"),
        ("k3", "D", "B"),
        ("k4", "D", "A"),
    )
    preds = [Prediction("k1", "A"), Prediction("k2", "A"), Prediction("k3", "A"), Prediction("k4", "B")]
    r = evaluate(preds, b)

    # A: TP=2, FP=1 (k3), FN=1 (k4) → precision 2/3, recall 2/3, f1 2/3
    assert math.isclose(r.per_class["A"].precision, 2 / 3)
    assert math.isclose(r.per_class["A"].recall, 2 / 3)
    assert math.isclose(r.per_class["A"].f1, 2 / 3)
    # B: TP=0, FP=1 (k4), FN=1 (k3) → all zero
    assert r.per_class["B"].precision == 0.0
    assert r.per_class["B"].recall == 0.0
    # accuracy = 2 correct / 4
    assert r.accuracy == 0.5
    assert r.per_class["A"].support == 3
    assert r.per_class["B"].support == 1


def test_missing_prediction_counts_as_a_miss_never_skipped():
    b = bench(("k1", "D", "A"), ("k2", "D", "A"))
    r = evaluate([Prediction("k1", "A")], b)  # no prediction for k2
    assert r.accuracy == 0.5
    assert r.per_class["A"].recall == 0.5
    assert r.evaluated_count == 2


def test_per_discipline_accuracy_is_isolated_by_discipline():
    b = bench(
        ("k1", "CONCRETE", "SLAB"),
        ("k2", "CONCRETE", "SLAB"),
        ("k3", "ELECTRICAL", "OUTLET"),
    )
    preds = [Prediction("k1", "SLAB"), Prediction("k2", "FOOTING"), Prediction("k3", "OUTLET")]
    r = evaluate(preds, b)
    assert r.per_discipline_accuracy == {"CONCRETE": 0.5, "ELECTRICAL": 1.0}


def test_flat_metrics_are_all_in_unit_range_and_keyed_for_the_registry():
    b = bench(("k1", "CONCRETE", "SLAB"), ("k2", "ELECTRICAL", "OUTLET"))
    r = evaluate([Prediction("k1", "SLAB"), Prediction("k2", "OUTLET")], b)
    flat = r.flat_metrics()
    assert flat["accuracy"] == 1.0
    assert "class.SLAB.f1" in flat
    assert "discipline.CONCRETE.accuracy" in flat
    assert all(0.0 <= v <= 1.0 for v in flat.values())
