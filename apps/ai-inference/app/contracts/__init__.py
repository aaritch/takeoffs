"""
Stage-contract mirror for the inference plane (P2-01).

This is the Python side of the cross-plane seam. It does NOT re-declare the stage shapes: it loads
the language-neutral JSON Schema that `@takeoff/contracts` emits from its Zod source of truth
(`packages/contracts/stage-contracts.schema.json`) and validates payloads against it. So TypeScript
(Zod) and Python (jsonschema) enforce the *same* contract by construction — there is no second copy
to drift. When the stage implementations land (P2-04+), they validate their I/O through here.
"""

from .stage_schemas import (
    FIXTURES_PATH,
    SCHEMA_PATH,
    is_valid,
    schema_for,
    stage_names,
    validate,
    validator_for,
)

__all__ = [
    "FIXTURES_PATH",
    "SCHEMA_PATH",
    "is_valid",
    "schema_for",
    "stage_names",
    "validate",
    "validator_for",
]
