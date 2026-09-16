"""Live audio levels for the music-mode waveform.

The Pi hears nothing, so a browser captures the audio (tab/system share or the
microphone), reduces it to a handful of frequency bands, and POSTs them here a
few times a second. Anything that hasn't been refreshed recently is considered
gone, and the renderer falls back to a synthesized waveform.
"""
from __future__ import annotations

import math
import threading
import time

_lock = threading.Lock()
_bands: list[float] = []
_at = 0.0
MAX_BANDS = 64


def record_levels(bands) -> int:
    """Store the latest band levels (each clamped to 0..1). Returns the count."""
    global _bands, _at
    out: list[float] = []
    for v in list(bands or [])[:MAX_BANDS]:
        try:
            out.append(max(0.0, min(1.0, float(v))))
        except (TypeError, ValueError):
            out.append(0.0)
    with _lock:
        _bands = out
        _at = time.monotonic()
    return len(out)


def current_levels(max_age: float = 1.5) -> list[float] | None:
    """The latest levels if they're fresh, else None."""
    with _lock:
        if not _bands or time.monotonic() - _at > max_age:
            return None
        return list(_bands)


def synth_levels(n: int, t: float) -> list[float]:
    """A gentle, deterministic fake waveform (no audio available): a few
    overlapping sines per bar so it breathes rather than jitters."""
    out = []
    for i in range(max(1, n)):
        v = (
            0.18
            + 0.32 * (0.5 + 0.5 * math.sin(t * (1.1 + 0.23 * i) + i * 1.7))
            + 0.22 * (0.5 + 0.5 * math.sin(t * 2.9 + i * 0.9))
            + 0.10 * (0.5 + 0.5 * math.sin(t * 5.3 - i * 0.4))
        )
        # A mild centre emphasis so it reads like a spectrum.
        c = 1.0 - abs((i - (n - 1) / 2) / max(1, (n - 1) / 2)) * 0.35
        out.append(max(0.0, min(1.0, v * c)))
    return out
