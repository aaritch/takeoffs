"""
Load and validate against the AI stage contracts emitted by ``@takeoff/contracts`` (P2-01).

The TypeScript package is the single source of truth: it generates
``packages/contracts/stage-contracts.schema.json`` from its Zod registry. This module reads that
exact file, so the inference plane validates stage payloads against the same contract the
orchestration/API plane does — no hand-maintained Python copy that could drift.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator

# .../apps/ai-inference/app/contracts/stage_schemas.py -> repo root is parents[4].
_CONTRACTS_DIR = Path(__file__).resolve().parents[4] / "packages" / "contracts"
SCHEMA_PATH = _CONTRACTS_DIR / "stage-contracts.schema.json"
FIXTURES_PATH = _CONTRACTS_DIR / "stage-fixtures.json"

Kind = str  # "input" | "output"


@lru_cache(maxsize=1)
def _document() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def stage_names() -> list[str]:
    """The pipeline stages, in declaration order (CLASSIFY … CONFIDENCE)."""
    return list(_document().keys())


def schema_for(stage: str, kind: Kind) -> dict[str, Any]:
    """The JSON Schema for a stage's ``input`` or ``output`` contract."""
    return _document()[stage][kind]


@lru_cache(maxsize=None)
def validator_for(stage: str, kind: Kind) -> Draft7Validator:
    return Draft7Validator(schema_for(stage, kind))


def validate(stage: str, kind: Kind, payload: Any) -> None:
    """Raise ``jsonschema.ValidationError`` if ``payload`` violates the stage contract."""
    validator_for(stage, kind).validate(payload)


def is_valid(stage: str, kind: Kind, payload: Any) -> bool:
    return validator_for(stage, kind).is_valid(payload)
