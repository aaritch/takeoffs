"""
Dataset record types (P4-05). A `FeedbackExample` is the raw signal exported from the app plane
(one per `DetectionFeedback` row, spec §5.4) — it carries the org (for opt-out), the discipline/trade
and human-confirmed class (the label), and full provenance (which feedback row and which model
version produced it). Assembly turns a stream of these into a versioned, immutable `Dataset` whose
`DatasetManifest` records exactly what went in and what was excluded (and why), so a training run is
reproducible and auditable.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Mapping

# Human review actions that yield a positive labeled example (the class is correct as labeled).
# REJECT is a negative signal about the AI's guess, not a labeled instance of a class, so it is not a
# training example for class learning — it is counted in the manifest but excluded from examples.
POSITIVE_ACTIONS = frozenset({"ACCEPT", "EDIT_GEOMETRY", "RECLASSIFY", "ADD_MISSED"})


@dataclass(frozen=True)
class FeedbackExample:
    """One human-reviewed detection, exported from the app plane as a candidate training example."""

    feedback_id: str
    org_id: str
    model_family: str
    discipline: str
    label_class: str
    action: str
    # Provenance: the model run + version whose candidate this feedback is about (None for ADD_MISSED).
    model_run_id: str | None = None
    model_version: str | None = None
    # A stable identity for de-duplication and benchmark-leak checks (e.g. the measurement id). Falls
    # back to the feedback id when not supplied.
    source_key: str | None = None

    def key(self) -> str:
        return self.source_key or self.feedback_id


@dataclass(frozen=True)
class ExampleProvenance:
    """Where one training example came from — recorded for every included example."""

    source_key: str
    feedback_id: str
    org_id: str
    model_version: str | None


@dataclass(frozen=True)
class TrainingExample:
    """A labeled example that made it into the dataset."""

    source_key: str
    model_family: str
    discipline: str
    label_class: str


@dataclass(frozen=True)
class DatasetManifest:
    """An auditable record of what an assembly consumed, kept, and dropped."""

    version: str
    content_hash: str
    included_count: int
    counts_by_family: Mapping[str, int]
    counts_by_discipline: Mapping[str, int]
    counts_by_class: Mapping[str, int]
    excluded_opted_out: int
    excluded_benchmark: int
    excluded_non_label: int
    provenance: tuple[ExampleProvenance, ...]


@dataclass(frozen=True)
class Dataset:
    """An immutable, versioned training set plus its manifest."""

    version: str
    examples: tuple[TrainingExample, ...]
    manifest: DatasetManifest

    def source_keys(self) -> frozenset[str]:
        return frozenset(e.source_key for e in self.examples)


def content_hash(version: str, keys: list[str]) -> str:
    """Deterministic hash of the (sorted) example keys under a version — same inputs → same id."""

    payload = json.dumps({"version": version, "keys": sorted(keys)}, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
