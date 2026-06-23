"""
Confidence assembly stage (P2-08, contract CONFIDENCE).

Combines the per-stage confidences into a single candidate score used for UI sorting and auto-accept
thresholds (spec §7.2 stage 10). The detection confidence is discounted by the sheet-level context
(scale + classification confidence) so a candidate on a shaky sheet scores lower even if the detector
was sure. Result is clamped to [0, 1].
"""

from __future__ import annotations

from typing import Any


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def assemble_confidence(
    payload: dict[str, Any],
    *,
    scale_confidence: float = 1.0,
    classification_confidence: float = 1.0,
) -> dict[str, Any]:
    """Add the final `aiConfidence` to each candidate; returns a CONFIDENCE-shaped payload."""
    candidates = [
        {
            **c,
            "aiConfidence": _clamp01(
                c["detectionConfidence"] * scale_confidence * classification_confidence
            ),
        }
        for c in payload["candidates"]
    ]
    return {"candidates": candidates}
