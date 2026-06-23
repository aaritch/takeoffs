"""
Quantification stage (P2-08, contract QUANTIFY).

Applies the sheet scale to each mapped candidate to compute its real-world `rawValue`, using the
EXACT same geometry math as the manual tools (geometry.raw_value mirrors @takeoff/geometry). The app
re-quantifies authoritatively on ingestion with the same formula, so the pipeline value and the
stored value never diverge (the P2-08 caveat).
"""

from __future__ import annotations

from typing import Any

from .geometry import raw_value


def quantify(payload: dict[str, Any]) -> dict[str, Any]:
    """Add `rawValue` to each candidate; returns a QUANTIFY-shaped payload."""
    upp = payload["unitPerPixel"]
    candidates = [{**c, "rawValue": raw_value(c["geometry"], upp)} for c in payload["candidates"]]
    return {"candidates": candidates}
