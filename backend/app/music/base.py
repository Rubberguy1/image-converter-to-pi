"""Music provider interface + the common 'now playing' shape."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class NowPlaying:
    playing: bool
    artist: str = ""
    title: str = ""
    album: str = ""
    # Exactly one of these identifies where to get album art:
    art_url: str | None = None     # http(s) URL the poller will download
    art_bytes: bytes | None = None  # already-fetched image bytes

    @property
    def track_key(self) -> str:
        """Stable identity for the current track so the poller only re-renders
        art when the track actually changes."""
        return f"{self.artist}␟{self.album}␟{self.title}".strip()


class MusicProvider(ABC):
    name: str

    @abstractmethod
    async def fetch(self) -> NowPlaying:
        """Return current now-playing state. Should return
        NowPlaying(playing=False) rather than raise on transient errors."""

    async def aclose(self) -> None:  # optional
        pass
