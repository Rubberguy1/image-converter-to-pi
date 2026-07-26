"""Push-based now-playing provider.

Unlike the polling providers (Plex/VLC/Last.fm), the source PUSHES state to us:
the browser extension POSTs to /api/music/nowplaying whenever what's playing in
any tab changes. We stash the latest push in a module-level store so the HTTP
endpoint and the poller's provider instance share it, regardless of which was
created first or when the provider is swapped at runtime.
"""
from __future__ import annotations

import base64
import time

from .base import MusicProvider, NowPlaying

# If no push arrives within this window we treat playback as stopped, so the
# panel clears even if the browser/extension vanishes without a final "paused".
# The extension re-sends the current track every few seconds as a heartbeat.
_STALE_SECONDS = 45.0


class _Store:
    def __init__(self) -> None:
        self._np = NowPlaying(playing=False)
        self._at = 0.0

    def update(self, np: NowPlaying) -> None:
        self._np = np
        self._at = time.monotonic()

    def get(self) -> NowPlaying:
        if not self._np.playing:
            return self._np
        if time.monotonic() - self._at > _STALE_SECONDS:
            return NowPlaying(playing=False)
        return self._np


_store = _Store()


def record(
    *,
    playing: bool,
    title: str = "",
    artist: str = "",
    album: str = "",
    art_url: str | None = None,
    art_b64: str | None = None,
) -> None:
    """Record the latest now-playing state pushed by an external source.

    Art may arrive as base64 bytes (preferred — survives blob:/cookie-gated
    images the Pi can't fetch itself) or as a plain URL the poller downloads.
    """
    art_bytes: bytes | None = None
    if art_b64:
        try:
            art_bytes = base64.b64decode(art_b64)
        except (ValueError, TypeError):
            art_bytes = None
    _store.update(
        NowPlaying(
            playing=bool(playing),
            title=title or "",
            artist=artist or "",
            album=album or "",
            # Prefer bytes; only keep a URL when we have no bytes.
            art_url=(art_url or None) if not art_bytes else None,
            art_bytes=art_bytes,
        )
    )


class PushProvider(MusicProvider):
    """Serves whatever an external source (the browser extension) last pushed."""

    name = "browser"

    async def fetch(self) -> NowPlaying:
        return _store.get()
