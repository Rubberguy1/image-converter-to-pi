"""Scene compositor: runs on the Pi, composites background + widgets each tick,
and pushes the result to the panel. Persistent — the clock ticks and weather
refreshes with no browser open."""
from __future__ import annotations

import asyncio
import logging
import time

import httpx
from PIL import Image, ImageDraw

from .. import perf
from ..config import Settings
from ..display import Player
from ..imaging import RenderOptions, SpinOptions, render_disc_frames, render_to_frames
from ..library import LibraryStore
from ..library.store import RenderSettings
from .model import Scene, load_scene, save_scene
from .render import (
    box_for,
    draw_boxed_text,
    draw_pixel_text,
    draw_widget,
    hex_rgb,
    scale_for,
    widget_font,
)

log = logging.getLogger(__name__)

_WEATHER_TTL = 600.0  # seconds between weather refreshes
_OPEN_METEO = "https://api.open-meteo.com/v1/forecast"


def _opts_key(cfg: dict) -> tuple:
    """Hashable cache key for an image widget's render settings."""
    crop = cfg.get("crop")
    window = cfg.get("window")
    return (
        cfg.get("fit", "cover"),
        round(float(cfg.get("brightness", 1.0)), 3),
        round(float(cfg.get("contrast", 1.0)), 3),
        round(float(cfg.get("saturation", 1.0)), 3),
        bool(cfg.get("nearest", False)),
        tuple(sorted(crop.items())) if isinstance(crop, dict) else None,
        tuple(window) if isinstance(window, (list, tuple)) else None,
        int(cfg.get("off_x", 0)),
        int(cfg.get("off_y", 0)),
        int(cfg.get("zoom", 1)),
    )


class SceneRunner:
    def __init__(
        self,
        player: Player,
        library: LibraryStore,
        settings: Settings,
        music=None,
    ) -> None:
        self._player = player
        self._library = library
        self._settings = settings
        self._music = music  # MusicPoller — source for the "music" album-art widget
        self.scene: Scene = load_scene()
        self._client = httpx.AsyncClient(timeout=8.0)

        self._weather: dict | None = None
        self._weather_at = 0.0
        self._values: dict[str, object] = {}
        # Rendered media frames keyed by (media_id, w, h, fit) — shared by the
        # background and image widgets.
        self._media_cache: dict[tuple, tuple] = {}
        # Rendered album-art tiles keyed by (track_key, w, h, fit).
        self._music_cache: dict[tuple, Image.Image] = {}
        # The compositor ticks as fast as the fastest on-screen animation needs
        # (so GIFs play at native speed), capped only to bound runaway frame
        # rates. 60 covers every real-world GIF; 64x64 compositing is trivially
        # cheap even on a Pi 3. Static scenes fall back to a slow idle tick that
        # still keeps the clock/weather fresh.
        self._max_fps = 60
        self._idle_interval = 0.5
        self._min_frame_ms: float | None = None
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
        log_at = 0.0
        while True:
            try:
                if self.scene.enabled:
                    await self._maybe_refresh_weather()
                    t0 = time.perf_counter()
                    frame = self._composite()
                    perf.composite.add((time.perf_counter() - t0) * 1000.0)
                    self._player.set_scene(frame)
                    now = time.monotonic()
                    if now - log_at >= 30.0:  # periodic load line in the terminal
                        log_at = now
                        c = perf.composite.stats()
                        log.info(
                            "perf: composite avg %.1fms max %.1fms (~%s fps) · cpu %s%% · load %s",
                            c["avg_ms"], c["max_ms"], c["fps"],
                            perf._proc_cpu_pct(), perf.snapshot().get("load_avg"),
                        )
                    await asyncio.sleep(self._tick_interval())
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
    def _tick_interval(self) -> float:
        """Seconds until the next tick: the fastest active animation frame,
        clamped to the fps cap; the idle interval when nothing is animating."""
        if self._min_frame_ms:
            return max(1.0 / self._max_fps, self._min_frame_ms / 1000.0)
        return self._idle_interval

    def _composite(self) -> Image.Image:
        self._min_frame_ms = None
        return self.render(self.scene)

    def render(self, scene: Scene) -> Image.Image:
        """Composite any scene at the panel content size (used live + for preview)."""
        cw, ch = self._settings.content_size
        base = self._background(scene.background, cw, ch)
        ctx = {"weather": self._weather, "values": self._values}
        for widget in scene.widgets:
            if getattr(widget, "hidden", False):
                continue
            try:
                if widget.type == "image":
                    self._draw_image(base, widget)
                elif widget.type == "music":
                    self._draw_music(base, widget)
                elif widget.type == "nowplaying":
                    self._draw_nowplaying(base, widget, cw, ch)
                else:
                    draw_widget(base, widget, ctx, cw, ch)
            except Exception:
                log.debug("widget %s draw failed", widget.id, exc_info=True)
        return base

    def _background(self, bg, cw: int, ch: int) -> Image.Image:
        if bg.type == "color":
            return Image.new("RGB", (cw, ch), hex_rgb(bg.color))
        if bg.type == "media" and bg.media_id:
            opts = RenderOptions(cw, ch, fit=bg.fit)
            frame = self._media_frame(bg.media_id, opts, (bg.media_id, cw, ch, bg.fit, "bg"))
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
        fit = cfg.get("fit", "cover")
        if fit in ("center", "integer"):
            # Viewport mode: the box is a fixed window into the image at a locked
            # pixel scale. off_x/off_y pan the image inside the box (a window into
            # the zoom-scaled source); resizing the box just crops the view.
            zoom = 1 if fit == "center" else max(1, int(cfg.get("zoom", 1)))
            off_x, off_y = int(cfg.get("off_x", 0)), int(cfg.get("off_y", 0))
            opts = RenderOptions(
                target_width=w,
                target_height=h,
                window=(-off_x, -off_y, w, h),
                zoom=zoom,
                nearest=True,
                brightness=float(cfg.get("brightness", 1.0)),
                contrast=float(cfg.get("contrast", 1.0)),
                saturation=float(cfg.get("saturation", 1.0)),
            )
        else:
            opts = RenderSettings(
                fit=fit,
                crop=cfg.get("crop"),
                brightness=float(cfg.get("brightness", 1.0)),
                contrast=float(cfg.get("contrast", 1.0)),
                saturation=float(cfg.get("saturation", 1.0)),
                nearest=bool(cfg.get("nearest", False)),
                window=cfg.get("window"),
            ).to_options(w, h)
        frame = self._media_frame(mid, opts, (mid, w, h, _opts_key(cfg)))
        if frame is not None:
            base.paste(frame, (int(widget.x), int(widget.y)))

    def _draw_music(self, base: Image.Image, widget) -> None:
        """Current track's album art as a placeable, resizable tile — either a
        static square or a spinning disc. Text lives in its own widget."""
        cfg = widget.config
        w = int(cfg.get("w") or 0)
        h = int(cfg.get("h") or 0)
        if w <= 0 or h <= 0:
            return
        x, y = int(widget.x), int(widget.y)
        disc = bool(cfg.get("disc"))

        np = self._music.now_playing() if self._music else None
        art = self._music.art_bytes() if self._music else None
        playing = bool(np and np.playing)

        if art and playing:
            if disc:
                frame = self._music_disc_frame(art, w, h, np.track_key)
                if frame is not None:
                    base.paste(frame, (x, y), self._disc_paste_mask(w, h))
                    return
            else:
                frame = self._music_tile(art, w, h, cfg.get("fit", "cover"), np.track_key)
                if frame is not None:
                    base.paste(frame, (x, y))
                    return

        # Player preview: a note on a dark tile (or dark disc) when idle, so the
        # widget stays visible and its layout is previewable.
        if disc:
            base.paste(Image.new("RGB", (w, h), (24, 24, 30)), (x, y), self._disc_paste_mask(w, h))
        else:
            base.paste(Image.new("RGB", (w, h), (24, 24, 30)), (x, y))
        font = widget_font(widget)
        nscale = max(1, min(w, h) // 12)
        nw, nh = 5 * nscale, font.height * nscale
        draw_pixel_text(base, x + (w - nw) // 2, y + (h - nh) // 2, "♪", (96, 96, 120), nscale, font)

    def _draw_nowplaying(self, base: Image.Image, widget, cw=None, ch=None) -> None:
        """Current track as boxed text — title first, artist below (each wraps)."""
        np = self._music.now_playing() if self._music else None
        playing = bool(np and np.playing)
        font = widget_font(widget)
        scale = scale_for(widget.size, font)
        if playing:
            parts = [np.title or np.album or "—"]
            if widget.config.get("show_artist", True) and np.artist:
                parts.append(np.artist)
            text = "\n".join(parts)
        else:
            text = "No track"
        w, h = box_for(widget, cw, ch)
        draw_boxed_text(base, int(widget.x), int(widget.y), w, h, text,
                        hex_rgb(widget.color), font, scale, widget.align)

    def _music_tile(self, art: bytes, w: int, h: int, fit: str, track_key):
        """Render (and cache) album-art bytes to a static w×h tile."""
        key = (track_key, w, h, fit)
        tile = self._music_cache.get(key)
        if tile is None:
            try:
                frames = render_to_frames(art, RenderOptions(w, h, fit=fit))
            except Exception:
                log.debug("album-art render failed", exc_info=True)
                return None
            tile = frames[0].image if frames else None
            if tile is None:
                return None
            self._bound_music_cache()
            self._music_cache[key] = tile
        return tile

    def _music_disc_frame(self, art: bytes, w: int, h: int, track_key):
        """Current frame of the spinning-disc album art (animates by wall-clock)."""
        key = (track_key, w, h, "disc")
        cached = self._music_cache.get(key)
        if cached is None:
            try:
                spin = SpinOptions(
                    frames=self._settings.music_spin_frames,
                    revolution_seconds=self._settings.music_spin_seconds,
                )
                frames = render_disc_frames(art, RenderOptions(w, h, fit="cover"), spin)
            except Exception:
                log.debug("disc render failed", exc_info=True)
                return None
            images = [f.image for f in frames]
            durations = [f.duration_ms for f in frames]
            cached = (images, durations, sum(durations) or 100)
            self._bound_music_cache()
            self._music_cache[key] = cached
        images, durations, total = cached
        if len(images) <= 1:
            return images[0] if images else None
        positive = [d for d in durations if d and d > 0]
        mn = min(positive) if positive else 100
        self._min_frame_ms = mn if self._min_frame_ms is None else min(self._min_frame_ms, mn)
        t = (time.monotonic() * 1000) % total
        acc = 0
        for i, d in enumerate(durations):
            acc += d
            if t < acc:
                return images[i]
        return images[-1]

    def _disc_paste_mask(self, w: int, h: int) -> Image.Image:
        """Circular alpha mask (with a centre spindle hole) so a disc widget
        shows only its circle over the scene, not the black surround."""
        key = ("mask", w, h)
        mask = self._music_cache.get(key)
        if mask is None:
            mask = Image.new("L", (w, h), 0)
            d = ImageDraw.Draw(mask)
            diameter = min(w, h)
            ox, oy = (w - diameter) // 2, (h - diameter) // 2
            d.ellipse([ox, oy, ox + diameter - 1, oy + diameter - 1], fill=255)
            r = (diameter / 2) * 0.12
            cx, cy = w / 2, h / 2
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)
            self._bound_music_cache()
            self._music_cache[key] = mask
        return mask

    def _bound_music_cache(self) -> None:
        if len(self._music_cache) > 8:
            self._music_cache.pop(next(iter(self._music_cache)))

    def _media_frame(self, media_id: str, opts: RenderOptions, key: tuple):
        """Current frame (animation cycles by wall-clock) of a media item rendered
        with `opts`. Cached across ticks; shared by background + image widgets."""
        cached = self._media_cache.get(key)
        if cached is None:
            item = self._library.get(media_id)
            if not item:
                return None
            try:
                frames = render_to_frames(item.original_path, opts)
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
        # This media is animated — let the compositor tick fast enough for it.
        positive = [d for d in durations if d and d > 0]
        mn = min(positive) if positive else 100
        self._min_frame_ms = mn if self._min_frame_ms is None else min(self._min_frame_ms, mn)
        t = (time.monotonic() * 1000) % total
        acc = 0
        for i, d in enumerate(durations):
            acc += d
            if t < acc:
                return images[i]
        return images[-1]
