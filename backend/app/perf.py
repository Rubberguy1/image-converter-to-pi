"""Lightweight runtime performance metrics.

So we can see the Pi's ACTUAL load — how long a scene composite takes, how long
a preview render takes, and how much CPU the process is using — before deciding
whether the app needs to move work off the Pi. Cheap enough to leave always on.
"""
from __future__ import annotations

import collections
import os
import threading
import time


class Timing:
    """Rolling window of durations (ms) for one repeated operation."""

    def __init__(self, maxlen: int = 120) -> None:
        self._samples: collections.deque[float] = collections.deque(maxlen=maxlen)
        self._lock = threading.Lock()
        self.count = 0

    def add(self, ms: float) -> None:
        with self._lock:
            self._samples.append(ms)
            self.count += 1

    def stats(self) -> dict:
        with self._lock:
            s = list(self._samples)
        if not s:
            return {"count": self.count, "avg_ms": 0.0, "max_ms": 0.0, "n": 0, "fps": None}
        avg = sum(s) / len(s)
        return {
            "count": self.count,
            "avg_ms": round(avg, 2),
            "max_ms": round(max(s), 2),
            "n": len(s),
            "fps": round(1000.0 / avg, 1) if avg > 0 else None,
        }


composite = Timing()  # one scene composite (the per-frame cost)
preview = Timing()     # one /api/scene/preview render + encode

_cpu_lock = threading.Lock()
_last_wall = time.monotonic()
_last_cpu = time.process_time()


def _proc_cpu_pct() -> float | None:
    """Process CPU% since the previous call (100% = one core; can exceed 100
    across threads — on the Pi this includes the matrix refresh thread)."""
    global _last_wall, _last_cpu
    with _cpu_lock:
        now_wall, now_cpu = time.monotonic(), time.process_time()
        dw, dc = now_wall - _last_wall, now_cpu - _last_cpu
        _last_wall, _last_cpu = now_wall, now_cpu
    if dw <= 0:
        return None
    return round(100.0 * dc / dw, 1)


def snapshot() -> dict:
    out: dict = {
        "composite": composite.stats(),
        "preview": preview.stats(),
        "cpu_count": os.cpu_count(),
        "proc_cpu_pct": _proc_cpu_pct(),
    }
    try:
        out["load_avg"] = [round(x, 2) for x in os.getloadavg()]  # Linux/Pi only
    except (OSError, AttributeError):
        out["load_avg"] = None
    return out
