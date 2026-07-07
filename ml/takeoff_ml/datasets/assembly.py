"""
Dataset assembly (P4-05). Turns exported `FeedbackExample`s into a versioned `Dataset`, enforcing the
two hard rules in code:

- **Opt-out** — any example whose org opted out of training is dropped (counted, never included). The
  opt-out is applied HERE, at assembly time, not by deleting feedback rows in the app plane
  (P2-11 caveat) — capture stays lossless; only training use is gated.
- **No benchmark leak** — any example whose stable key is in the frozen benchmark is dropped, so the
  held-out set can never contaminate training and the metrics stay meaningful (P4-05 caveat).

Only label-bearing actions (ACCEPT/EDIT/RECLASSIFY/ADD_MISSED) become examples; REJECT is tallied but
not a class instance. The result is deterministic: same inputs → same content hash.
"""

from __future__ import annotations

from collections import Counter
from typing import Iterable

from .records import (
    Dataset,
    DatasetManifest,
    ExampleProvenance,
    FeedbackExample,
    POSITIVE_ACTIONS,
    TrainingExample,
    content_hash,
)


def assemble_dataset(
    feedback: Iterable[FeedbackExample],
    *,
    version: str,
    opted_out_orgs: Iterable[str] = (),
    benchmark_keys: Iterable[str] = (),
) -> Dataset:
    opted_out = frozenset(opted_out_orgs)
    benchmark = frozenset(benchmark_keys)

    examples: list[TrainingExample] = []
    provenance: list[ExampleProvenance] = []
    excluded_opted_out = 0
    excluded_benchmark = 0
    excluded_non_label = 0
    seen: set[str] = set()

    # Sort by key so assembly order (hence the manifest) is deterministic regardless of input order.
    for fx in sorted(feedback, key=lambda f: f.key()):
        # Opt-out takes precedence — an opted-out org contributes nothing, whatever the action.
        if fx.org_id in opted_out:
            excluded_opted_out += 1
            continue
        if fx.key() in benchmark:
            excluded_benchmark += 1
            continue
        if fx.action not in POSITIVE_ACTIONS:
            excluded_non_label += 1
            continue
        key = fx.key()
        if key in seen:
            continue
        seen.add(key)
        examples.append(
            TrainingExample(
                source_key=key,
                model_family=fx.model_family,
                discipline=fx.discipline,
                label_class=fx.label_class,
            )
        )
        provenance.append(
            ExampleProvenance(
                source_key=key,
                feedback_id=fx.feedback_id,
                org_id=fx.org_id,
                model_version=fx.model_version,
            )
        )

    manifest = DatasetManifest(
        version=version,
        content_hash=content_hash(version, [e.source_key for e in examples]),
        included_count=len(examples),
        counts_by_family=dict(Counter(e.model_family for e in examples)),
        counts_by_discipline=dict(Counter(e.discipline for e in examples)),
        counts_by_class=dict(Counter(e.label_class for e in examples)),
        excluded_opted_out=excluded_opted_out,
        excluded_benchmark=excluded_benchmark,
        excluded_non_label=excluded_non_label,
        provenance=tuple(provenance),
    )
    return Dataset(version=version, examples=tuple(examples), manifest=manifest)
