"""
Redis-backed job source + result sink (P2-02, deployment). The worker drains ``jobs:inference`` and
publishes to ``jobs:inference-results`` (which the app plane drains + ingests authoritatively). Uses
a blocking pop so an idle worker parks on the socket rather than busy-looping — and so Azure
Container Apps' KEDA queue scaler can scale it to zero when the list is empty.

`redis` is imported lazily (only the deployed worker needs it), keeping the unit-testable core +
CI contract job free of the dependency.
"""

from __future__ import annotations

import json
from typing import Any

INFERENCE_QUEUE = "jobs:inference"
RESULTS_QUEUE = "jobs:inference-results"


class RedisJobSource:
    def __init__(self, client: Any, queue: str = INFERENCE_QUEUE, block_seconds: int = 5) -> None:
        self._client = client
        self._queue = queue
        self._block = block_seconds

    def next(self) -> dict[str, Any] | None:
        item = self._client.brpop(self._queue, timeout=self._block)
        if item is None:
            return None  # timed out with an empty queue → let the worker re-poll
        _, payload = item
        return json.loads(payload)


class RedisResultSink:
    def __init__(self, client: Any, queue: str = RESULTS_QUEUE) -> None:
        self._client = client
        self._queue = queue

    def publish(self, result: dict[str, Any]) -> None:
        self._client.lpush(self._queue, json.dumps(result))
