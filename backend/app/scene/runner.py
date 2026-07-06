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
        # Rendered media frames keyed by (media_id, w, h, fit) — shared by the
        # background and image widgets.
        self._media_cache: dict[tuple, tuple] = {}
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
                if widget.type == "image":
                    self._draw_image(base, widget)
                else:
                    draw_widget(base, widget, ctx)
            except Exception:
                log.debug("widget %s draw failed", widget.id, exc_info=True)
        return base

    def _background(self, bg, cw: int, ch: int) -> Image.Image:
        if bg.type == "color":
            return Image.new("RGB", (cw, ch), hex_rgb(bg.color))
        if bg.type == "media" and bg.media_id:
            frame = self._media_frame(bg.media_id, cw, ch, bg.fit)
            if frame is not None:
                return frame.copy()
        return Image.new("RGB", (cw, ch), (0, 0, 0))

    def _draw_image(self, base: Image.Image, widget) -> None:
        cfg = widget.config
        mid = cfg.get("media_id")
        w = int(cfg.get("w") or 0)
        h = int(cfg.get("h") or 0)
        if not mid or w <= 0 or h <= 0:
            return
        frame = self._media_frame(mid, w, h, cfg.get("fit", "cover"))
        if frame is not None:
            base.paste(frame, (int(widget.x), int(widget.y)))

    def _media_frame(self, media_id: str, w: int, h: int, fit: str):
        """Current frame (animation cycles by wall-clock) of a media item rendered
        to w×h with the given fit. Cached across ticks; shared by background +
        image widgets."""
        key = (media_id, w, h, fit)
        cached = self._media_cache.get(key)
        if cached is None:
            item = self._library.get(media_id)
            if not item:
                return None
            try:
                frames = render_to_frames(item.original_path, RenderOptions(w, h, fit=fit))
            except Exception:
                log.exception("scene media render failed")
                return None
            images = [f.image for f in frames]
            durations = [f.duration_ms for f in frames]
            cached = (images, durations, sum(durations) or 100)
            if len(self._media_cache) > 16:  # bound the cache
                self._media_cache.pop(next(iter(self._media_cache)))
            self._media_cache[key] = cached
        images, durations, total = cached
        if len(images) <= 1:
            return images[0] if images else None
        t = (time.monotonic() * 1000) % total
        acc = 0
        for i, d in enumerate(durations):
            acc += d
            if t < acc:
                return images[i]
        return images[-1]
