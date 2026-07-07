"""
Container entrypoint for the inference worker (P2-02). Two modes:

  python -m app.serving              # deployed worker: drain jobs:inference off REDIS_URL forever
  python -m app.serving --selftest   # run one synthetic job end to end (no Redis) and exit 0

The selftest lets the deployed image prove it runs (as a one-off Container App job) without a live
broker or GPU — the queue→worker→result path with a no-op pipeline.
"""

from __future__ import annotations

import json
import logging
import os
import sys

from .worker import Worker


def _selftest() -> int:
    logging.info("selftest: running one synthetic sheet job through the worker")
    published: list[dict] = []

    class _OneShotSource:
        def __init__(self) -> None:
            self._done = False

        def next(self):
            if self._done:
                return None
            self._done = True
            return {
                "correlationId": "selftest",
                "modelRunId": "00000000-0000-7000-8000-000000000001",
                "orgId": "00000000-0000-7000-8000-000000000002",
                "sheetId": "00000000-0000-7000-8000-000000000003",
                "planSetId": "00000000-0000-7000-8000-000000000004",
                "pipelineVersion": "skeleton-0.1.0",
                "modelVersions": {"classify": "0.0.0", "scale": "0.0.0"},
            }

    class _CaptureSink:
        def publish(self, result):
            published.append(result)

    n = Worker(_OneShotSource(), _CaptureSink()).run(stop_when_empty=True)
    logging.info("selftest: processed %d job(s); result=%s", n, json.dumps(published[0]))
    return 0 if n == 1 and published and published[0]["status"] == "SUCCEEDED" else 1


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = argv if argv is not None else sys.argv[1:]

    if "--selftest" in args:
        return _selftest()

    url = os.environ.get("REDIS_URL")
    if not url:
        logging.error("REDIS_URL is not set; the worker needs the broker to drain jobs:inference")
        return 1

    import redis  # lazy: only the deployed worker needs the driver

    from .redis_io import RedisJobSource, RedisResultSink

    client = redis.from_url(url, decode_responses=True)
    worker = Worker(RedisJobSource(client), RedisResultSink(client))
    logging.info("inference worker started; draining jobs:inference (scale-to-zero when idle)")
    worker.run()  # blocks on brpop; runs until the container is stopped
    return 0


if __name__ == "__main__":
    sys.exit(main())
