"""Scene compositor: runs on the Pi, composites background + widgets each tick,
and pushes the result to the panel. Persistent — the clock ticks and weather
refreshes with no browser open."""
from __future__ import annotations

import asyncio
import logging
import time

import httpx
from PIL import Image

from ..config import Settings
from ..display import Player
from ..imaging import RenderOptions, render_to_frames
from ..library import LibraryStore
from .model import Scene, load_scene, save_scene
from .render import draw_widget, hex_rgb

log = logging.getLogger(__name__)

_WEATHER_TTL = 600.0  # seconds between weather refreshes
_OPEN_METEO = "https://api.open-meteo.com/v1/forecast"


class SceneRunner:
    def __init__(self, player: Player, library: LibraryStore, settings: Settings) -> None:
        self._player = player
        self._library = library
        self._settings = settings
        self.scene: Scene = load_scene()
        self._client = httpx.AsyncClient(timeout=8.0)

        self._weather: dict | None = None
        self._weather_at = 0.0
        self._values: dict[str, object] = {}
        self._bg_cache: tuple | None = None  # (media_id, images, durations, total_ms)
        self._fps = 5
        self._task: asyncio.Task | None = None

    # --- lifecycle ---
    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop(), name="scene")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self._client.aclose()
        self._player.clear_scene()

    # --- API-facing ---
    def set_scene(self, scene: Scene) -> None:
        self.scene = scene
        save_scene(scene)
        self._bg_cache = None
        if not scene.enabled:
            self._player.clear_scene()

    def set_enabled(self, enabled: bool) -> None:
        self.scene.enabled = enabled
        save_scene(self.scene)
        if not enabled:
            self._player.clear_scene()

    def push_value(self, name: str, value) -> None:
        self._values[name] = value

    def status(self) -> dict:
        return {
            "enabled": self.scene.enabled,
            "widgets": len(self.scene.widgets),
            "weather": self._weather,
            "values": self._values,
        }

    # --- loop ---
    async def _loop(self) -> None:
        while True:
            try:
                if self.scene.enabled:
                    await self._maybe_refresh_weather()
                    self._player.set_scene(self._composite())
                    await asyncio.sleep(1.0 / self._fps)
                else:
                    await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("scene tick failed")
                await asyncio.sleep(1.0)

    async def _maybe_refresh_weather(self) -> None:
        if not any(w.type == "weather" for w in self.scene.widgets):
            return
        if self._weather and time.monotonic() - self._weather_at < _WEATHER_TTL:
            return
        lat, lon = self._settings.weather_lat, self._settings.weather_lon
        if not lat and not lon:
            return
        try:
            resp = await self._client.get(
                _OPEN_METEO,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m",
                    "temperature_unit": self._settings.weather_unit,
                },
            )
            resp.raise_for_status()
            cur = resp.json().get("current", {})
            self._weather = {
                "temp": cur.get("temperature_2m", 0),
                "unit": "F" if self._settings.weather_unit == "fahrenheit" else "C",
            }
            self._weather_at = time.monotonic()
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("weather fetch failed: %s", exc)

    # --- compositing ---
    def _composite(self) -> Image.Image:
        return self.render(self.scene)

    def render(self, scene: Scene) -> Image.Image:
        """Composite any scene at the panel content size (used live + for preview)."""
        cw, ch = self._settings.content_size
        base = self._background(scene.background, cw, ch)
        ctx = {"weather": self._weather, "values": self._values}
        for widget in scene.widgets:
            try:
                draw_widget(base, widget, ctx)
            except Exception:
                log.debug("widget %s draw failed", widget.id, exc_info=True)
        return base

    def _background(self, bg, cw: int, ch: int) -> Image.Image:
        if bg.type == "color":
            return Image.new("RGB", (cw, ch), hex_rgb(bg.color))
        if bg.type == "media" and bg.media_id:
            images = self._bg_frames(bg, cw, ch)
            if images:
                return images[self._bg_index()].copy()
        return Image.new("RGB", (cw, ch), (0, 0, 0))

    def _bg_frames(self, bg, cw: int, ch: int):
        if self._bg_cache and self._bg_cache[0] == bg.media_id:
            return self._bg_cache[1]
        item = self._library.get(bg.media_id)
        if not item:
            return None
        try:
            frames = render_to_frames(
                item.original_path, RenderOptions(cw, ch, fit=bg.fit)
            )
        except Exception:
            log.exception("scene background render failed")
            return None
        images = [f.image for f in frames]
        durations = [f.duration_ms for f in frames]
        self._bg_cache = (bg.media_id, images, durations, sum(durations) or 100)
        return images

    def _bg_index(self) -> int:
        if not self._bg_cache or len(self._bg_cache[1]) <= 1:
            return 0
        _, images, durations, total = self._bg_cache
        t = (time.monotonic() * 1000) % total
        acc = 0
        for i, d in enumerate(durations):
            acc += d
            if t < acc:
                return i
        return len(images) - 1
