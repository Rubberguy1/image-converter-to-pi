"""Scene compositor: runs on the Pi, composites background + widgets each tick,
and pushes the result to the panel. Persistent — the clock ticks and weather
refreshes with no browser open."""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import httpx
from PIL import Image, ImageDraw

from .. import perf
from ..config import Settings
from ..display import Player
from ..sprites import SpriteRenderer, anchor_offset, draw_bubble, visible_chars
from ..imaging import (
    Frame,
    RenderOptions,
    SpinOptions,
    decode_source,
    process_frame,
    render_disc_frames,
    render_to_frames,
)
from ..library import LibraryStore
from ..library.store import RenderSettings
from .model import Background, Scene, Widget, load_scene, save_scene
from .pixelfont import get_font
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

# Speech-bubble defaults (per widget, in config.bubble). Which clip plays for
# which event lives on the sprite itself (its trigger list, set in the studio).
_DEFAULT_BUBBLE = {
    "enabled": True,
    "notifications": True,   # present notifications as a speech bubble
    "track": True,           # announce a new track ("♪ title / artist")
    "track_seconds": 6.0,
    "side": "auto",          # auto | left | right | above | below | custom (uses `box`)
    "box": None,             # custom placement: {dx, dy, w, h} relative to the sprite's top-left
    "style": "light",        # light (white bubble) | dark (black, white border)
    "font": None,            # None = widget font
    "cps": 18,               # typewriter speed, characters per second
    "hold": 1.5,             # seconds the bubble lingers after the last character
    "radius": 2,             # corner rounding in px (0 = square)
    "tail": "auto",          # auto (faces the sprite) | left | right | top | bottom | none
    "tail_at": None,         # 0..1 along that edge; None = aim at the sprite
    "sample": "Hi!",         # shown in the editor preview so you can place it
}


@dataclass
class _SpriteState:
    """Per-widget runtime state (never persisted): which clip is playing and
    since when, plus any explicit 'say' the API asked for."""
    clip: str | None = None
    clip_started: float = 0.0
    say_text: str = ""
    say_clip: str = ""
    say_until: float = 0.0
    # Speech bubble typewriter: the text being shown and when it started.
    bubble_text: str = ""
    bubble_started: float = 0.0


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
        sprites=None,
    ) -> None:
        self._player = player
        self._library = library
        self._settings = settings
        self._music = music  # MusicPoller — source for the "music" album-art widget
        # Sprite sheets (the assistant's body) + a frame cache. The notification
        # manager is attached after construction (it's built later in main.py).
        self._sprites = sprites
        self._sprite_renderer = SpriteRenderer(sprites) if sprites else None
        self._sprite_states: dict[str, _SpriteState] = {}
        self._notifications = None
        self._last_track_key: str | None = None
        self._track_changed_at = 0.0
        self.scene: Scene = load_scene()
        self._client = httpx.AsyncClient(timeout=8.0)

        self._weather: dict | None = None
        self._weather_at = 0.0
        self._values: dict[str, object] = {}
        # Rendered media frames keyed by (media_id, w, h, fit) — shared by the
        # background and image widgets.
        self._media_cache: dict[tuple, tuple] = {}
        # Decoded (downscaled) source frames keyed by (media_id, max_side) so
        # editing never re-decodes the original file — decode once, re-render cheap.
        self._source_cache: dict[tuple, tuple] = {}
        self._anim_total = 0  # longest animation loop (ms) seen in the last render
        # Rendered album-art tiles keyed by (track_key, w, h, fit). Shared with a
        # background worker (see _submit_music_render), so guard it with a lock.
        self._music_cache: dict[tuple, Image.Image] = {}
        self._music_lock = threading.Lock()
        self._music_pending: set = set()
        # Album art is rasterised OFF the event loop — 36 supersampled disc
        # frames take a couple of seconds on a Pi, and doing that inline froze
        # the whole compositor on every track change. One worker: serialise the
        # heavy renders rather than thrash the CPU.
        self._music_executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="music-art"
        )
        # Circular paste masks — cheap, main-thread only, kept out of the shared
        # cache so they never contend with the worker.
        self._mask_cache: dict[tuple, Image.Image] = {}
        # The compositor ticks as fast as the fastest on-screen animation needs
        # (so GIFs play at native speed), capped only to bound runaway frame
        # rates. 60 covers every real-world GIF; 64x64 compositing is trivially
        # cheap even on a Pi 3. Static scenes fall back to a slow idle tick that
        # still keeps the clock/weather fresh.
        self._max_fps = 60
        self._idle_interval = 0.5
        self._min_frame_ms: float | None = None
        self._task: asyncio.Task | None = None
        # Music mode: a runtime override that dedicates the panel to fullscreen
        # now-playing art, falling back to a clock when nothing plays. Rendered
        # by the same compositor but never persisted, so it doesn't touch the
        # user's saved scene.
        self._music_mode = False

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
        self._music_executor.shutdown(wait=False)
        self._player.clear_scene()

    def attach_notifications(self, manager) -> None:
        self._notifications = manager

    # --- API-facing ---
    def set_scene(self, scene: Scene) -> None:
        self.scene = scene
        save_scene(scene)
        # Drop runtime state for sprites that are no longer in the scene.
        keep = {w.id for w in scene.widgets}
        self._sprite_states = {k: v for k, v in self._sprite_states.items() if k in keep}
        if not scene.enabled:
            self._player.clear_scene()

    def say(self, text: str, clip: str = "", duration: float = 5.0, widget_id: str | None = None) -> int:
        """Make the scene's sprite(s) say `text` (speech bubble) while playing
        `clip` (default: the widget's notify reaction) for `duration` seconds.
        Targets one widget by id, or every sprite widget. Returns the count."""
        now = time.monotonic()
        n = 0
        for w in self.scene.widgets:
            if w.type != "sprite" or (widget_id and w.id != widget_id):
                continue
            st = self._sprite_states.setdefault(w.id, _SpriteState())
            st.say_text = (text or "").strip()
            st.say_clip = clip or ""
            st.say_until = now + max(0.5, float(duration))
            n += 1
        return n

    def set_enabled(self, enabled: bool) -> None:
        self.scene.enabled = enabled
        save_scene(self.scene)
        if not enabled:
            self._player.clear_scene()

    def push_value(self, name: str, value) -> None:
        self._values[name] = value

    def set_music_mode(self, on: bool) -> None:
        """Turn the fullscreen music-mode override on or off. Turning it off
        hands the panel back to the saved scene (or blanks it if disabled)."""
        self._music_mode = bool(on)
        if not self._music_mode and not self.scene.enabled:
            self._player.clear_scene()
        log.info("music mode %s", "ON" if self._music_mode else "OFF")

    def music_mode(self) -> bool:
        return self._music_mode

    def status(self) -> dict:
        return {
            "enabled": self.scene.enabled,
            "music_mode": self._music_mode,
            "widgets": len(self.scene.widgets),
            "weather": self._weather,
            "values": self._values,
            "sprites": {
                wid: {"clip": st.clip, "saying": st.say_until > time.monotonic()}
                for wid, st in self._sprite_states.items()
            },
        }

    # --- loop ---
    async def _loop(self) -> None:
        log_at = 0.0
        while True:
            try:
                if self._music_mode:
                    self._set_banner_suppressed(False)
                    self._min_frame_ms = None
                    frame = self.render(self._music_mode_scene())
                    self._player.set_scene(frame)
                    await asyncio.sleep(self._tick_interval())
                elif self.scene.enabled:
                    await self._maybe_refresh_weather()
                    self._update_signals()
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
                    self._set_banner_suppressed(False)
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

    # --- signals the sprites react to ---
    def _update_signals(self) -> None:
        """Once per live tick: detect track changes and decide whether a sprite
        is presenting notifications (which hides the banner)."""
        now = time.monotonic()
        np = self._music.now_playing() if self._music else None
        key = np.track_key if (np and np.playing) else None
        if key != self._last_track_key:
            self._last_track_key = key
            if key:
                self._track_changed_at = now
        presenting = any(
            w.type == "sprite" and not getattr(w, "hidden", False)
            and (w.config or {}).get("sprite_id")
            and self._bubble_cfg(w.config).get("enabled", True)
            and self._bubble_cfg(w.config).get("notifications", True)
            for w in self.scene.widgets
        )
        self._set_banner_suppressed(presenting)

    def _set_banner_suppressed(self, on: bool) -> None:
        if self._notifications is not None:
            self._notifications.set_banner_suppressed(on)

    @staticmethod
    def _bubble_cfg(cfg: dict) -> dict:
        return {**_DEFAULT_BUBBLE, **(cfg.get("bubble") or {})}

    def _music_mode_scene(self) -> Scene:
        """Build the music-mode scene for this tick: fullscreen album art when
        something is playing, otherwise a big centred clock. Regenerated each
        tick so it swaps the moment playback starts or stops."""
        cw, ch = self._settings.content_size
        np = self._music.now_playing() if self._music else None
        art = self._music.art_bytes() if self._music else None
        black = Background(type="color", color="#000000")

        if np and np.playing and art:
            widget = Widget(
                id="mm-art", type="music", x=0, y=0,
                config={"w": cw, "h": ch, "fit": "cover", "disc": False},
            )
        else:
            size = max(8, round(ch * 0.42))
            y = max(0, (ch - size) // 2 - 1)
            widget = Widget(
                id="mm-clock", type="clock", x=0, y=y,
                color="#FFFFFF", size=size, align="center",
                config={"w": cw, "h": ch - y, "format": "%H:%M"},
            )
        return Scene(enabled=True, background=black, widgets=[widget])

    def render(self, scene: Scene, at_ms: float | None = None) -> Image.Image:
        """Composite any scene at the panel content size (used live + for preview).
        `at_ms` overrides the animation clock so a whole loop can be rendered."""
        cw, ch = self._settings.content_size
        base = self._background(scene.background, cw, ch, at_ms)
        ctx = {"weather": self._weather, "values": self._values}
        for widget in scene.widgets:
            if getattr(widget, "hidden", False):
                continue
            try:
                if widget.type == "image":
                    self._draw_image(base, widget, at_ms)
                elif widget.type == "music":
                    self._draw_music(base, widget, at_ms)
                elif widget.type == "nowplaying":
                    self._draw_nowplaying(base, widget, cw, ch)
                elif widget.type == "sprite":
                    self._draw_sprite(base, widget, at_ms)
                else:
                    draw_widget(base, widget, ctx, cw, ch)
            except Exception:
                log.debug("widget %s draw failed", widget.id, exc_info=True)
        return base

    def render_animation(self, scene: Scene, max_frames: int = 60, max_ms: int = 6000):
        """Render one full animation loop of the scene as a list of Frames (for a
        natively-playing animated-GIF preview). Returns a single frame if nothing
        in the scene animates."""
        self._anim_total = 0
        self._min_frame_ms = None
        first = self.render(scene, at_ms=0)  # probe: fills caches + animation stats
        if not self._anim_total or not self._min_frame_ms:
            return [Frame(first)]
        period = min(self._anim_total, max_ms)
        # honor native frame duration, but cap the frame count for a light preview
        step = max(self._min_frame_ms, 30.0, period / max_frames)
        n = max(1, min(max_frames, round(period / step)))
        step = period / n
        return [Frame(self.render(scene, at_ms=round(i * step)), round(step)) for i in range(n)]

    def _background(self, bg, cw: int, ch: int, at_ms=None) -> Image.Image:
        if bg.type == "color":
            return Image.new("RGB", (cw, ch), hex_rgb(bg.color))
        if bg.type == "media" and bg.media_id:
            opts = RenderOptions(cw, ch, fit=bg.fit)
            frame = self._media_frame(bg.media_id, opts, (bg.media_id, cw, ch, bg.fit, "bg"), at_ms)
            if frame is not None:
                return frame.copy()
        return Image.new("RGB", (cw, ch), (0, 0, 0))

    def _draw_image(self, base: Image.Image, widget, at_ms=None) -> None:
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
        frame = self._media_frame(mid, opts, (mid, w, h, _opts_key(cfg)), at_ms)
        if frame is not None:
            base.paste(frame, (int(widget.x), int(widget.y)))

    def _draw_music(self, base: Image.Image, widget, at_ms=None) -> None:
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
                frame = self._music_disc_frame(art, w, h, np.track_key, at_ms)
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

    # --- sprites (the assistant) ---
    def _note_anim(self, frame_ms: float, total_ms: float) -> None:
        """Register an animation so the tick rate + preview loop cover it."""
        self._min_frame_ms = frame_ms if self._min_frame_ms is None else min(self._min_frame_ms, frame_ms)
        self._anim_total = max(self._anim_total, int(total_ms))

    @staticmethod
    def _value_matches(params: dict, values: dict) -> bool:
        name = str(params.get("name") or "")
        if not name or name not in values:
            return False
        v = values.get(name)
        target = params.get("value")
        op = str(params.get("op") or "==")
        try:
            a, b = float(v), float(target)
        except (TypeError, ValueError):
            a, b = str(v), str(target)
            if op not in ("==", "!="):
                return False
        return {
            "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b,
            "==": a == b, "!=": a != b,
        }.get(op, False)

    @staticmethod
    def _time_matches(params: dict) -> bool:
        def hm(s, default):
            try:
                h, m = str(s or default).split(":")
                return int(h) * 60 + int(m)
            except (ValueError, AttributeError):
                return None
        start, end = hm(params.get("from"), "22:00"), hm(params.get("to"), "07:00")
        if start is None or end is None:
            return False
        t = time.localtime()
        cur = t.tm_hour * 60 + t.tm_min
        if start <= end:
            return start <= cur < end
        return cur >= start or cur < end  # window wraps past midnight

    def _sprite_intent(self, sp, cfg: dict, state: _SpriteState, now: float, preview: bool):
        """Decide what the sprite should be doing this tick: (clip name, bubble
        text). Walks the sprite's trigger list in priority order; the first
        event that is happening wins. An explicit `say` is always honoured even
        if the sprite has no say trigger (the API asked for it)."""
        bub = self._bubble_cfg(cfg)
        idle = sp.idle_clip or "idle"
        bubbles = bool(bub.get("enabled", True))

        if preview:
            # The editor: idle clip + the sample bubble so it can be positioned.
            return idle, (str(bub.get("sample") or "") if bubbles else "")

        # Priority is by event kind (say > notification > track > music > value
        # > time); among triggers of the same kind, the sprite's list order wins.
        rank = {"say": 0, "notification": 1, "track": 2, "music": 3, "value": 4, "time": 5}
        triggers = sorted(sp.triggers, key=lambda t: rank.get(t.event, 9))
        by_event = {}
        for t in triggers:
            by_event.setdefault(t.event, t)

        say_clip = ""
        if state.say_until > now:
            say_t = by_event.get("say")
            say_clip = state.say_clip or (say_t.clip if say_t else "") or (by_event.get("notification").clip if by_event.get("notification") else "") or idle

        np = self._music.now_playing() if self._music else None
        playing = bool(np and np.playing)
        cur = self._notifications.current() if self._notifications else None
        music_clip = next((t.clip for t in triggers if t.event == "music" and t.clip), "")

        for t in triggers:
            ev = t.event
            if ev == "say":
                if say_clip:
                    return say_clip, (state.say_text if bubbles else "")
            elif ev == "notification":
                if cur is not None and bub.get("notifications", True):
                    parts = [p for p in (cur.title, cur.message) if p]
                    text = "\n".join(parts) if parts else cur.source
                    return (t.clip or idle), (text if bubbles else "")
            elif ev == "track":
                secs = float((t.params or {}).get("seconds", bub.get("track_seconds", 6.0)) or 6.0)
                if playing and bub.get("track", True) and now - self._track_changed_at < secs:
                    text = f"♪ {np.title or np.album or 'Now playing'}"
                    if np.artist:
                        text += f"\n{np.artist}"
                    return (t.clip or music_clip or idle), (text if bubbles else "")
            elif ev == "music":
                if playing and t.clip:
                    return t.clip, ""
            elif ev == "value":
                if t.clip and self._value_matches(t.params or {}, self._values):
                    return t.clip, ""
            elif ev == "time":
                if t.clip and self._time_matches(t.params or {}):
                    return t.clip, ""
        if say_clip:  # no say trigger listed, but the API asked — still speak
            return say_clip, (state.say_text if bubbles else "")
        return idle, ""

    def _draw_sprite(self, base: Image.Image, widget, at_ms=None) -> None:
        """A sprite-sheet character: plays the clip its situation calls for,
        integer-scaled and alpha-pasted, with an optional speech bubble."""
        cfg = widget.config or {}
        sp = self._sprites.get(cfg.get("sprite_id")) if self._sprites else None
        x, y = int(widget.x), int(widget.y)
        scale = max(1, min(16, int(cfg.get("scale", 1) or 1)))
        if sp is None:
            # Placeholder tile so an unassigned sprite widget is still visible.
            w = int(cfg.get("w") or 16)
            h = int(cfg.get("h") or 16)
            base.paste(Image.new("RGB", (w, h), (24, 24, 30)), (x, y))
            font = widget_font(widget)
            draw_pixel_text(base, x + max(0, (w - 5) // 2), y + max(0, (h - font.height) // 2), "?", (96, 96, 120), 1, font)
            return
        frames = self._sprite_renderer.frames(sp, scale, bool(cfg.get("flip")))
        if not frames:
            return

        preview = at_ms is not None
        now = time.monotonic()
        # Previews (editor / thumbnails) must not disturb the live clip timing.
        state = _SpriteState() if preview else self._sprite_states.setdefault(widget.id, _SpriteState())
        clip_name, bubble_text = self._sprite_intent(sp, cfg, state, now, preview)

        # Typewriter: text reveals at `cps`; the talking animation plays only
        # while characters are still arriving, then the sprite goes back to
        # what it would otherwise be doing (music → dance, else idle) while the
        # finished bubble lingers for `hold` seconds.
        bub = self._bubble_cfg(cfg)
        cps = max(2.0, float(bub.get("cps", 18) or 18))
        hold = max(0.0, float(bub.get("hold", 1.5) or 0))
        reveal = None
        if not preview:
            if bubble_text:
                if bubble_text != state.bubble_text:
                    state.bubble_text = bubble_text
                    state.bubble_started = now
            elif state.bubble_text:
                done_at = state.bubble_started + visible_chars(state.bubble_text) / cps + hold
                if now < done_at:
                    bubble_text = state.bubble_text  # source gone; let it finish + linger
                else:
                    state.bubble_text = ""
            if bubble_text:
                reveal = int((now - state.bubble_started) * cps)
                if reveal < visible_chars(bubble_text):
                    self._note_anim(1000.0 / cps, 0)  # tick per character
                else:
                    np = self._music.now_playing() if self._music else None
                    music_clip = next((t.clip for t in sp.triggers if t.event == "music" and t.clip), "")
                    clip_name = music_clip if (np and np.playing and music_clip) else (sp.idle_clip or "idle")
        clip_name, clip = sp.clip_or_fallback(clip_name)
        if clip_name != state.clip:
            state.clip = clip_name
            state.clip_started = now  # a new clip starts from its first frame

        n = len(clip.frames)
        fps = max(0.5, float(clip.fps))
        if n > 1:
            t_ms = at_ms if preview else (now - state.clip_started) * 1000.0
            step = int(t_ms / 1000.0 * fps)
            i = step % n if clip.loop else min(n - 1, step)
            self._note_anim(1000.0 / fps, clip.period_ms)
        else:
            i = 0
        idx = clip.frames[i] if n else 0
        im = frames[max(0, min(len(frames) - 1, idx))]
        # Frames can differ in size (several regions); place this one inside the
        # widget box (largest frame × scale) by the sprite's anchor.
        bw, bh = sp.box
        bw, bh = bw * scale, bh * scale
        ox, oy = anchor_offset(sp.anchor, bw, bh, im.width, im.height)
        base.paste(im, (x + ox, y + oy), im)

        if bubble_text:
            font = get_font(bub.get("font")) if bub.get("font") else widget_font(widget)
            bscale = max(1, int(bub.get("scale", 1) or 1))
            side = str(bub.get("side", "auto"))
            box = None
            b = bub.get("box")
            if side == "custom" and isinstance(b, dict):
                box = (x + int(b.get("dx", 0)), y + int(b.get("dy", 0)),
                       max(4, int(b.get("w", 24))), max(4, int(b.get("h", 12))))
            draw_bubble(
                base, bubble_text, (x, y, bw, bh),
                font=font, scale=bscale, side=side,
                style=str(bub.get("style", "light")), box=box, reveal=reveal,
                radius=int(bub.get("radius", 2) or 0),
                tail=str(bub.get("tail", "auto") or "auto"),
                tail_at=(None if bub.get("tail_at") is None else max(0.0, min(1.0, float(bub["tail_at"])))),
            )
            if not preview:
                self._note_anim(250.0, 0)  # keep ticking so expiry stays responsive

    def _submit_music_render(self, key, fn) -> None:
        """Rasterise album art in the background so the composite loop never
        blocks on it. `fn()` returns the cached value; stored under `key` when
        done. No-op if this key is already being rendered."""
        with self._music_lock:
            if key in self._music_pending or key in self._music_cache:
                return
            self._music_pending.add(key)

        def job():
            try:
                value = fn()
            except Exception:
                log.debug("album-art render failed", exc_info=True)
                value = None
            with self._music_lock:
                self._music_pending.discard(key)
                if value is not None:
                    self._bound_music_cache()
                    self._music_cache[key] = value

        self._music_executor.submit(job)

    def _music_tile(self, art: bytes, w: int, h: int, fit: str, track_key):
        """Album-art as a static w×h tile. Rendered off-loop; returns None (draw
        the placeholder) until it's ready."""
        key = (track_key, w, h, fit)
        with self._music_lock:
            tile = self._music_cache.get(key)
        if tile is None:
            self._submit_music_render(
                key, lambda: self._render_tile(art, w, h, fit)
            )
            return None
        return tile

    def _render_tile(self, art: bytes, w: int, h: int, fit: str):
        frames = render_to_frames(art, RenderOptions(w, h, fit=fit))
        return frames[0].image if frames else None

    def _render_disc(self, art: bytes, w: int, h: int):
        spin = SpinOptions(
            frames=self._settings.music_spin_frames,
            revolution_seconds=self._settings.music_spin_seconds,
        )
        frames = render_disc_frames(art, RenderOptions(w, h, fit="cover"), spin)
        if not frames:
            return None
        images = [f.image for f in frames]
        durations = [f.duration_ms for f in frames]
        return (images, durations, sum(durations) or 100)

    def _music_disc_frame(self, art: bytes, w: int, h: int, track_key, at_ms=None):
        """Current frame of the spinning-disc album art (animates by wall-clock).
        Rendered off-loop; returns None (draw the placeholder) until it's ready."""
        key = (track_key, w, h, "disc")
        with self._music_lock:
            cached = self._music_cache.get(key)
        if cached is None:
            self._submit_music_render(key, lambda: self._render_disc(art, w, h))
            return None
        images, durations, total = cached
        if len(images) <= 1:
            return images[0] if images else None
        positive = [d for d in durations if d and d > 0]
        mn = min(positive) if positive else 100
        self._min_frame_ms = mn if self._min_frame_ms is None else min(self._min_frame_ms, mn)
        self._anim_total = max(self._anim_total, total)
        t = (at_ms if at_ms is not None else time.monotonic() * 1000) % total
        acc = 0
        for i, d in enumerate(durations):
            acc += d
            if t < acc:
                return images[i]
        return images[-1]

    def _disc_paste_mask(self, w: int, h: int) -> Image.Image:
        """Circular alpha mask (with a centre spindle hole) so a disc widget
        shows only its circle over the scene, not the black surround."""
        key = (w, h)
        mask = self._mask_cache.get(key)
        if mask is None:
            mask = Image.new("L", (w, h), 0)
            d = ImageDraw.Draw(mask)
            diameter = min(w, h)
            ox, oy = (w - diameter) // 2, (h - diameter) // 2
            d.ellipse([ox, oy, ox + diameter - 1, oy + diameter - 1], fill=255)
            r = (diameter / 2) * 0.12
            cx, cy = w / 2, h / 2
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)
            if len(self._mask_cache) > 8:
                self._mask_cache.pop(next(iter(self._mask_cache)))
            self._mask_cache[key] = mask
        return mask

    def _bound_music_cache(self) -> None:
        if len(self._music_cache) > 8:
            self._music_cache.pop(next(iter(self._music_cache)))

    def _source_frames(self, media_id: str, max_side):
        """Decoded (and downscaled) source frames for a media item, cached per
        (media_id, max_side) so editing never re-decodes the original — the
        expensive step happens once, then re-renders are cheap."""
        ck = (media_id, max_side)
        cached = self._source_cache.get(ck)
        if cached is None:
            item = self._library.get(media_id)
            if not item:
                return None
            try:
                frames = decode_source(item.original_path, max_side)
            except Exception:
                log.exception("scene media decode failed")
                return None
            cached = ([im for im, _ in frames], [d for _, d in frames])
            if len(self._source_cache) > 6:  # decoded frames are bigger — bound tighter
                self._source_cache.pop(next(iter(self._source_cache)))
            self._source_cache[ck] = cached
        return cached

    def _media_frame(self, media_id: str, opts: RenderOptions, key: tuple, at_ms=None):
        """Current frame (animation cycles by wall-clock, or `at_ms` when given) of
        a media item rendered with `opts`. Cached; shared by bg + image widgets."""
        cached = self._media_cache.get(key)
        if cached is None:
            # Viewport (window) modes need native pixels; fit modes only ever
            # shrink to the tile, so a working-size cap keeps decode/render cheap.
            max_side = None if opts.window is not None else 512
            src = self._source_frames(media_id, max_side)
            if not src:
                return None
            src_images, durations = src
            try:
                images = [process_frame(im, opts) for im in src_images]
            except Exception:
                log.exception("scene media render failed")
                return None
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
        self._anim_total = max(self._anim_total, total)
        t = (at_ms if at_ms is not None else time.monotonic() * 1000) % total
        acc = 0
        for i, d in enumerate(durations):
            acc += d
            if t < acc:
                return images[i]
        return images[-1]
