"""
Tests for the deterministic pipeline stages (P2-08): vectorize → map → quantify → confidence.

Each stage's output is also validated against the P2-01 JSON Schema (the cross-plane contract), so
the stage logic and the seam can't drift apart. Quantify is checked against the SAME numbers the
manual tools produce (identical scale conversion — the P2-08 caveat).
"""

from __future__ import annotations

import pytest

from app import stages
from app.contracts import stage_schemas as ss


def _square(s: float) -> dict:
    return {
        "type": "POLYGON",
        "exterior": [
            {"x": 0, "y": 0},
            {"x": 0, "y": s},
            {"x": s, "y": s},
            {"x": s, "y": 0},
        ],
    }


def _det(geometry: dict, cls: str, conf: float) -> dict:
    return {"geometry": geometry, "objectClass": cls, "confidence": conf}


def test_vectorize_dedupes_overlapping_same_class() -> None:
    a = _det(_square(50), "slab", 0.6)
    b = _det(_square(50), "slab", 0.9)  # same place, higher confidence
    out = stages.vectorize({"lines": [], "regions": [a, b], "symbols": []}, eps=2.0)
    assert len(out["regions"]) == 1
    assert out["regions"][0]["confidence"] == 0.9  # the survivor is the most confident
    ss.validate("VECTORIZE", "output", out)


def test_vectorize_keeps_distinct_positions_and_other_classes() -> None:
    near = _det({"type": "POINT", "point": {"x": 0, "y": 0}}, "door", 0.8)
    far = _det({"type": "POINT", "point": {"x": 100, "y": 100}}, "door", 0.7)
    other = _det({"type": "POINT", "point": {"x": 0, "y": 0}}, "window", 0.7)
    out = stages.vectorize({"lines": [], "regions": [], "symbols": [near, far, other]}, eps=2.0)
    assert len(out["symbols"]) == 3  # far apart OR different class → all kept


def test_mapping_lands_in_right_type_and_unit() -> None:
    detections = [
        _det({"type": "POLYLINE", "points": [{"x": 0, "y": 0}, {"x": 0, "y": 10}]}, "wall", 0.7),
        _det(_square(10), "slab", 0.8),
        _det({"type": "POINT", "point": {"x": 1, "y": 1}}, "door", 0.9),
    ]
    out = stages.map_detections({"detections": detections})
    by_class = {c["objectClass"]: c for c in out["candidates"]}
    assert (by_class["wall"]["measurementType"], by_class["wall"]["unit"]) == ("LINEAR", "LF")
    assert (by_class["slab"]["measurementType"], by_class["slab"]["unit"]) == ("AREA", "SF")
    assert (by_class["door"]["measurementType"], by_class["door"]["unit"]) == ("COUNT", "EA")
    ss.validate("MAP", "output", out)


def test_mapping_unknown_class_falls_back_to_geometry_default() -> None:
    out = stages.map_detections({"detections": [_det(_square(10), "mystery", 0.5)]})
    c = out["candidates"][0]
    assert (c["measurementType"], c["unit"]) == ("AREA", "SF")


def test_quantify_matches_manual_geometry_math() -> None:
    # 100×100 px polygon at 0.5 ft/px → 2500 sq ft, identical to computeRawValue / the manual tool.
    mapped = stages.map_detections({"detections": [_det(_square(100), "slab", 0.8)]})
    out = stages.quantify({"candidates": mapped["candidates"], "unitPerPixel": 0.5})
    assert out["candidates"][0]["rawValue"] == 2500
    ss.validate("QUANTIFY", "output", out)


def test_quantify_polyline_and_count() -> None:
    line = stages.map_detections(
        {"detections": [_det({"type": "POLYLINE", "points": [{"x": 0, "y": 0}, {"x": 0, "y": 200}]}, "wall", 0.7)]}
    )
    out = stages.quantify({"candidates": line["candidates"], "unitPerPixel": 0.5})
    assert out["candidates"][0]["rawValue"] == 100  # 200 px × 0.5

    doors = stages.map_detections(
        {"detections": [_det({"type": "POINT_GROUP", "points": [{"x": 0, "y": 0}, {"x": 1, "y": 1}, {"x": 2, "y": 2}]}, "door", 0.9)]}
    )
    out2 = stages.quantify({"candidates": doors["candidates"], "unitPerPixel": 0.5})
    assert out2["candidates"][0]["rawValue"] == 3  # count is scale-independent


def test_confidence_combines_context_and_clamps() -> None:
    mapped = stages.map_detections({"detections": [_det(_square(10), "slab", 0.8)]})
    q = stages.quantify({"candidates": mapped["candidates"], "unitPerPixel": 0.5})
    out = stages.assemble_confidence(q, scale_confidence=0.5, classification_confidence=0.9)
    assert out["candidates"][0]["aiConfidence"] == pytest.approx(0.8 * 0.5 * 0.9)
    ss.validate("CONFIDENCE", "output", out)
    # Defaults (no sheet context) → the final score is just the detection confidence.
    assert stages.assemble_confidence(q)["candidates"][0]["aiConfidence"] == pytest.approx(0.8)


def test_full_deterministic_pipeline_composes_and_validates() -> None:
    regions = [_det(_square(100), "slab", 0.8), _det(_square(100), "slab", 0.6)]  # duplicate
    symbols = [_det({"type": "POINT", "point": {"x": 5, "y": 5}}, "door", 0.95)]
    vec = stages.vectorize({"lines": [], "regions": regions, "symbols": symbols}, eps=2.0)
    flat = vec["regions"] + vec["symbols"]
    mapped = stages.map_detections({"detections": flat})
    quantified = stages.quantify({"candidates": mapped["candidates"], "unitPerPixel": 0.5})
    scored = stages.assemble_confidence(quantified, scale_confidence=0.9)

    by_class: dict[str, list[dict]] = {}
    for c in scored["candidates"]:
        by_class.setdefault(c["objectClass"], []).append(c)
    assert len(by_class["slab"]) == 1  # the duplicate slab was merged
    assert by_class["slab"][0]["rawValue"] == 2500
    assert by_class["door"][0]["rawValue"] == 1
    ss.validate("CONFIDENCE", "output", scored)
