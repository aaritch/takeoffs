"""
Vectorization & cleanup stage (P2-08, contract VECTORIZE).

Cleans raw detector output before mapping. The cleanup that matters most in practice is deduping
overlapping detections (the same object found twice) — greedy, confidence-first NMS by class and
centroid proximity, so the highest-confidence detection of a cluster survives and the rest are
dropped. Snapping/merging of vertices can layer on here later; the contract shape is unchanged.
"""

from __future__ import annotations

from typing import Any

from .geometry import centroid, distance

Detection = dict[str, Any]

# Proximity (in normalized sheet units) under which two same-class detections are "the same object".
DEFAULT_MERGE_EPS = 1.0


def _dedupe(detections: list[Detection], eps: float) -> list[Detection]:
    kept: list[Detection] = []
    for d in sorted(detections, key=lambda x: x["confidence"], reverse=True):
        c = centroid(d["geometry"])
        if any(
            d["objectClass"] == k["objectClass"] and distance(c, centroid(k["geometry"])) <= eps
            for k in kept
        ):
            continue
        kept.append(d)
    return kept


def vectorize(payload: dict[str, Any], eps: float = DEFAULT_MERGE_EPS) -> dict[str, Any]:
    """Dedupe each detection layer; returns a VECTORIZE-shaped payload."""
    return {
        "lines": _dedupe(payload.get("lines", []), eps),
        "regions": _dedupe(payload.get("regions", []), eps),
        "symbols": _dedupe(payload.get("symbols", []), eps),
    }
