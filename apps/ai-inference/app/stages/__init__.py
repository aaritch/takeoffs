"""
Deterministic pipeline stages (P2-08): vectorize → map → quantify → confidence.

These are the non-model post-processing stages — pure functions over the P2-01 contract shapes, so
they run anywhere with no GPU. The probabilistic stages (classify/ocr/scale/lines/regions/symbols)
land with the GPU compute home. Each function takes a stage-input dict and returns a stage-output
dict that validates against `app.contracts` (stage-contracts.schema.json).
"""

from .confidence import assemble_confidence
from .geometry import polygon_area, polyline_length, raw_value
from .mapping import map_detections
from .quantify import quantify
from .vectorize import vectorize

__all__ = [
    "assemble_confidence",
    "map_detections",
    "polygon_area",
    "polyline_length",
    "quantify",
    "raw_value",
    "vectorize",
]
