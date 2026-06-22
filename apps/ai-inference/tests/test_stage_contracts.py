"""
Cross-plane parity tests for the AI stage contracts (P2-01).

These validate the SAME shared fixtures (`packages/contracts/stage-fixtures.json`) that the
TypeScript Zod test validates, against the SAME JSON Schema artifact — proving the stage seam means
the same thing on the Python (inference) and TypeScript (orchestration/API) planes.
"""

from __future__ import annotations

import json

import pytest
from jsonschema import ValidationError

from app.contracts import stage_schemas as ss

FIXTURES = json.loads(ss.FIXTURES_PATH.read_text(encoding="utf-8"))
STAGES = ss.stage_names()


def test_all_ten_stages_present_in_order() -> None:
    assert STAGES == [
        "CLASSIFY",
        "OCR",
        "SCALE",
        "LINES",
        "REGIONS",
        "SYMBOLS",
        "VECTORIZE",
        "MAP",
        "QUANTIFY",
        "CONFIDENCE",
    ]


@pytest.mark.parametrize("stage", STAGES)
def test_stage_output_fixture_validates(stage: str) -> None:
    # The identical payload the TS/Zod test accepts must validate here too.
    ss.validate(stage, "output", FIXTURES[stage]["output"])


def test_missing_required_field_is_rejected() -> None:
    good = FIXTURES["CONFIDENCE"]["output"]
    bad = {"candidates": [dict(good["candidates"][0])]}
    del bad["candidates"][0]["aiConfidence"]
    assert not ss.is_valid("CONFIDENCE", "output", bad)
    with pytest.raises(ValidationError):
        ss.validate("CONFIDENCE", "output", bad)


def test_null_scale_allowed_but_partial_scale_rejected() -> None:
    assert ss.is_valid("SCALE", "output", {"scale": None})
    assert not ss.is_valid(
        "SCALE",
        "output",
        {"scale": {"scaleUnits": "IMPERIAL", "source": "NOTATION", "confidence": 0.8}},
    )


def test_invalid_geometry_is_rejected() -> None:
    # A polyline needs >=2 points — the same rule manual measurements enforce.
    bad = {
        "lines": [
            {
                "geometry": {"type": "POLYLINE", "points": [{"x": 0, "y": 0}]},
                "objectClass": "wall",
                "confidence": 0.5,
            }
        ]
    }
    assert not ss.is_valid("LINES", "output", bad)
