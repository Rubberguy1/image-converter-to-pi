"""Background music poller.

Runs an asyncio loop that asks the active provider what's playing. When the track
changes it downloads the album art, renders it to the panel via the Player's music
override, and clears the override when playback stops. Provider selection and
enable/disable can be changed at runtime from the API.
"""
from __future__ import annotations

import asyncio
import logging

import httpx

from ..config import Settings
from ..display import Player
from ..imaging import RenderOptions, SpinOptions, render_disc_frames, render_to_frames
from .base import MusicProvider, NowPlaying
from .lastfm import LastFmProvider
from .plex import PlexProvider
from .vlc import VlcProvider

log = logging.getLogger(__name__)


def build_provider(name: str, settings: Settings) -> MusicProvider | None:
    """Construct a provider by name, or None for 'none'. Raises ValueError if
    the chosen provider is missing required configuration."""
    if name == "none":
        return None
    if name == "plex":
        return PlexProvider(settings.plex_base_url, settings.plex_token)
    if name == "vlc":
        return VlcProvider(settings.vlc_base_url, settings.vlc_password)
    if name == "lastfm":
        return LastFmProvider(settings.lastfm_api_key, settings.lastfm_user)
    raise ValueError(f"unknown music provider: {name}")


class MusicPoller:
    def __init__(self, player: Player, settings: Settings) -> None:
        self._player = player
        self._settings = settings
        self._provider: MusicProvider | None = None
        self._provider_name = "none"
        self._enabled = False
        self._poll_seconds = settings.music_poll_seconds
        self._client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)

        self._spin = settings.music_spin
        self._last_key: str | None = None
        self._owns_panel = False
        self._task: asyncio.Task | None = None
        self._error: str | None = None
        self._current = NowPlaying(playing=False)

    # --- lifecycle ---
    async def start(self) -> None:
        # Apply initial config from settings (best-effort).
        if self._settings.music_enabled and self._settings.music_provider != "none":
            try:
                self.configure(self._settings.music_provider, True)
            except ValueError as exc:
                self._error = str(exc)
        self._task = asyncio.create_task(self._loop(), name="music-poller")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._provider:
            await self._provider.aclose()
        await self._client.aclose()

    # --- configuration (called from API) ---
    def configure(self, provider_name: str, enabled: bool, spin: bool | None = None) -> None:
        """Switch provider, enable state, and/or the spin effect. Raises
        ValueError on bad config."""
        provider = build_provider(provider_name, self._settings)
        # Close the old provider lazily; we just drop the reference here.
        self._provider = provider
        self._provider_name = provider_name
        self._enabled = enabled and provider is not None
        if spin is not None:
            self._spin = spin
        self._error = None
        self._last_key = None  # force the current art to re-render (e.g. spin toggle)
        if self._enabled:
            # Enabling sync dedicates the panel to album art right away (blank
            # until a track is detected); the custom image is hidden.
            self._player.enter_music_mode()
            self._owns_panel = True
        else:
            self._player.exit_music_mode()
            self._owns_panel = False

    def status(self) -> dict:
        return {
            "enabled": self._enabled,
            "provider": self._provider_name,
            "playing": self._current.playing,
            "owns_panel": self._owns_panel,
            "artist": self._current.artist,
            "album": self._current.album,
            "title": self._current.title,
            "spin": self._spin,
            "error": self._error,
        }

    # --- internals ---
    async def _loop(self) -> None:
        while True:
            try:
                if self._enabled and self._provider:
                    await self._tick()
                    await asyncio.sleep(self._poll_seconds)
                else:
                    await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                raise
            except Exception:  # keep the loop alive no matter what
                log.exception("music poll tick failed")
                await asyncio.sleep(self._poll_seconds)

    async def _tick(self) -> None:
        assert self._provider is not None
        np = await self._provider.fetch()
        self._current = np

        if not np.playing:
            # Stay in music mode (panel blank), don't reveal the custom image.
            if self._last_key is not None:
                self._player.clear_music()
                self._last_key = None
            return

        if np.track_key == self._last_key:
            return  # same track already on the panel

        art = await self._resolve_art(np)
        if art is None:
            log.debug("no art for %s", np.track_key)
            self._last_key = np.track_key  # don't retry every tick
            return

        content_w, content_h = self._settings.content_size
        opts = RenderOptions(
            target_width=content_w,
            target_height=content_h,
            fit="cover",
        )
        try:
            if self._spin:
                spin = SpinOptions(
                    frames=self._settings.music_spin_frames,
                    revolution_seconds=self._settings.music_spin_seconds,
                )
                frames = render_disc_frames(art, opts, spin)
            else:
                frames = render_to_frames(art, opts)
        except Exception:
            log.exception("failed to render album art")
            return

        label = f"{np.artist} – {np.title}".strip(" –")
        self._player.set_music(frames, label or np.title)
        self._owns_panel = True
        self._last_key = np.track_key

    async def _resolve_art(self, np: NowPlaying) -> bytes | None:
        if np.art_bytes:
            return np.art_bytes
        if np.art_url:
            try:
                resp = await self._client.get(np.art_url)
                if resp.status_code == 200 and resp.content:
                    return resp.content
            except httpx.HTTPError as exc:
                log.debug("art download failed: %s", exc)
        return None
