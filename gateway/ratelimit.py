"""Lightweight in-memory per-user rate limiter for the LLM agent endpoints.

Fixed-window counter keyed by (bucket, identity). This is per-process and resets
on restart — sufficient for the single-process dev/gateway setup. For a
multi-replica deployment, swap the store for Redis.
"""
from __future__ import annotations

import threading
import time

from gateway.config import AGENT_RATE_LIMIT, AGENT_RATE_WINDOW

_lock = threading.Lock()
# key -> (window_start_epoch, count)
_counters: dict[str, tuple[float, int]] = {}


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: float):
        super().__init__("Rate limit exceeded")
        self.retry_after = retry_after


def check(identity: str, bucket: str, limit: int = AGENT_RATE_LIMIT, window: float = AGENT_RATE_WINDOW) -> None:
    """Count one request for (bucket, identity). Raises RateLimitExceeded if over limit."""
    key = f"{bucket}:{identity}"
    now = time.monotonic()
    with _lock:
        start, count = _counters.get(key, (now, 0))
        if now - start >= window:
            start, count = now, 0
        count += 1
        _counters[key] = (start, count)
        if count > limit:
            raise RateLimitExceeded(retry_after=max(0.0, window - (now - start)))
