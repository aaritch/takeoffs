"""
The frozen benchmark (P4-05 · GATE). A held-out, immutable set of ground-truth examples that a
candidate is evaluated against. Two things keep the metrics meaningful:

- It is **frozen** — an immutable dataclass over a tuple; you cannot mutate it in place.
- It **never leaks into training** — `assert_no_leak` fails an assembly whose keys intersect the
  benchmark, so a candidate is never evaluated on data it trained on.

Keys are stable identities (e.g. measurement ids) shared with `FeedbackExample.key()`, so the leak
check is exact.
"""

from __future__ import annotations

from dataclasses import dataclass


class BenchmarkLeakError(Exception):
    """Raised when training data intersects the frozen benchmark — a correctness-fatal contamination."""


@dataclass(frozen=True)
class BenchmarkExample:
    key: str
    discipline: str
    label_class: str


@dataclass(frozen=True)
class Benchmark:
    benchmark_id: str
    examples: tuple[BenchmarkExample, ...]

    def keys(self) -> frozenset[str]:
        return frozenset(e.key for e in self.examples)

    def disciplines(self) -> frozenset[str]:
        return frozenset(e.discipline for e in self.examples)


def assert_no_leak(training_keys: frozenset[str], benchmark: Benchmark) -> None:
    """Fail closed if any training key is also a benchmark key (defense in depth beyond assembly)."""

    leaked = training_keys & benchmark.keys()
    if leaked:
        sample = ", ".join(sorted(leaked)[:5])
        raise BenchmarkLeakError(
            f"{len(leaked)} training example(s) overlap the frozen benchmark {benchmark.benchmark_id}: {sample}"
        )
