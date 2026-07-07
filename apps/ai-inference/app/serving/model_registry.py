"""
Model registry (P2-02). Resolves the pinned pipeline + per-model versions for a run so every
``ModelRun``'s lineage is reproducible (spec §7.4). The SKELETON echoes the versions the job pinned
under a fixed skeleton pipeline version; the real registry loads concrete model weights by version
here once trained models + the GPU compute home exist (P4-06 promotes/rolls back versions into it).
"""

from __future__ import annotations

from dataclasses import dataclass

SKELETON_PIPELINE_VERSION = "skeleton-0.1.0"


@dataclass(frozen=True)
class PinnedVersions:
    """The exact versions a run executed with — recorded for lineage."""

    pipeline_version: str
    model_versions: dict[str, str]


class ModelRegistry:
    def __init__(self, pipeline_version: str = SKELETON_PIPELINE_VERSION) -> None:
        self._pipeline_version = pipeline_version

    def resolve(self, requested_model_versions: dict[str, str]) -> PinnedVersions:
        """
        Pin the versions for a run. A real registry maps requested → concrete promoted versions and
        loads the weights; the skeleton records the requested map verbatim so lineage flows end to
        end even before real models exist.
        """
        return PinnedVersions(
            pipeline_version=self._pipeline_version,
            model_versions=dict(requested_model_versions),
        )
