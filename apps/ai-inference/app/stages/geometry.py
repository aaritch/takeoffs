"""
Geometry math for the deterministic pipeline stages (P2-08).

This MIRRORS `@takeoff/geometry` (packages/geometry) byte-for-byte in formula so the AI pipeline and
the manual tools compute the identical quantity from identical geometry (the P2-08 caveat — any
divergence produces inconsistent numbers between modes). The app plane re-quantifies authoritatively
in TypeScript on ingestion using the same package, so this is the provisional pipeline value; keeping
the formulas identical means the two never disagree.
"""

from __future__ import annotations

import math
from typing import Any

Point = dict[str, float]


def distance(a: Point, b: Point) -> float:
    return math.hypot(b["x"] - a["x"], b["y"] - a["y"])


def polyline_length(points: list[Point]) -> float:
    """Sum of segment lengths; 0 for < 2 points (mirrors polylineLength)."""
    return sum(distance(points[i - 1], points[i]) for i in range(1, len(points)))


def ring_signed_area(ring: list[Point]) -> float:
    """Shoelace signed area; only magnitude is used for quantities (mirrors ringSignedArea)."""
    n = len(ring)
    if n < 3:
        return 0.0
    s = 0.0
    for i in range(n):
        a = ring[i]
        b = ring[(i + 1) % n]
        s += a["x"] * b["y"] - b["x"] * a["y"]
    return s / 2


def ring_area(ring: list[Point]) -> float:
    return abs(ring_signed_area(ring))


def polygon_area(exterior: list[Point], holes: list[list[Point]] | None = None) -> float:
    """Outer ring minus interior rings, floored at 0 (mirrors polygonArea)."""
    outer = ring_area(exterior)
    inner = sum(ring_area(r) for r in (holes or []))
    return max(0.0, outer - inner)


def to_real_length(geometric_length: float, unit_per_pixel: float) -> float:
    return geometric_length * unit_per_pixel


def to_real_area(geometric_area: float, unit_per_pixel: float) -> float:
    return geometric_area * unit_per_pixel * unit_per_pixel


def raw_value(geometry: dict[str, Any], unit_per_pixel: float) -> float:
    """The real-world quantity for a geometry + scale — mirrors computeRawValue (the app's path)."""
    t = geometry["type"]
    if t == "POLYLINE":
        return to_real_length(polyline_length(geometry["points"]), unit_per_pixel)
    if t == "POLYGON":
        return to_real_area(polygon_area(geometry["exterior"], geometry.get("holes")), unit_per_pixel)
    if t == "POINT":
        return 1.0
    if t == "POINT_GROUP":
        return float(len(geometry["points"]))
    raise ValueError(f"unknown geometry type: {t}")


def centroid(geometry: dict[str, Any]) -> Point:
    """A representative point for proximity/dedup (P2-08 vectorize)."""
    t = geometry["type"]
    if t == "POINT":
        return geometry["point"]
    pts = geometry["exterior"] if t == "POLYGON" else geometry["points"]
    n = len(pts)
    return {"x": sum(p["x"] for p in pts) / n, "y": sum(p["y"] for p in pts) / n}
