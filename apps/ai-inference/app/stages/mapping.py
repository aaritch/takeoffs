"""
Classification → condition mapping stage (P2-08, contract MAP).

Maps each detected object class to the measurement TYPE + UNIT a condition would use, plus a stable
`conditionKey` the app resolves to an actual Condition (matching by ai_object_class or creating one —
that resolution is the app plane's job, see ai-runs/ingest). Keeping this a pure rules table means
the orchestration stays ignorant of model internals (spec §7.3). Unknown classes fall back to the
default for their geometry kind, so a new class still produces a usable candidate.
"""

from __future__ import annotations

from typing import Any

# class (lowercased) -> (measurementType, unit)
CLASS_RULES: dict[str, tuple[str, str]] = {
    "wall": ("LINEAR", "LF"),
    "partition": ("LINEAR", "LF"),
    "footing": ("LINEAR", "LF"),
    "curb": ("LINEAR", "LF"),
    "pipe": ("LINEAR", "LF"),
    "slab": ("AREA", "SF"),
    "room": ("AREA", "SF"),
    "roof": ("AREA", "SF"),
    "paving": ("AREA", "SF"),
    "door": ("COUNT", "EA"),
    "window": ("COUNT", "EA"),
    "column": ("COUNT", "EA"),
    "fixture": ("COUNT", "EA"),
    "receptacle": ("COUNT", "EA"),
    "tree": ("COUNT", "EA"),
}

GEOM_DEFAULT: dict[str, tuple[str, str]] = {
    "POLYLINE": ("LINEAR", "LF"),
    "POLYGON": ("AREA", "SF"),
    "POINT": ("COUNT", "EA"),
    "POINT_GROUP": ("COUNT", "EA"),
}


def map_detections(payload: dict[str, Any]) -> dict[str, Any]:
    """Turn detections into mapped candidates; returns a MAP-shaped payload."""
    candidates = []
    for d in payload["detections"]:
        cls = d["objectClass"]
        measurement_type, unit = CLASS_RULES.get(cls.lower(), GEOM_DEFAULT[d["geometry"]["type"]])
        candidates.append(
            {
                "geometry": d["geometry"],
                "objectClass": cls,
                "measurementType": measurement_type,
                "unit": unit,
                "conditionKey": cls.lower(),
                "detectionConfidence": d["confidence"],
            }
        )
    return {"candidates": candidates}
