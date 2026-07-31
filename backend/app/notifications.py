"""Notifications: a queue of transient pop-ups that animate in over whatever the
panel is showing, hold for a set time, then slide away.

Any source can raise one by POSTing to /api/notifications — a Discord bot, a
game-server monitor, the browser extension, or the app itself. The manager
handles ordering (priority then FIFO), expiry, per-source muting, and rendering
the banner; the Player composites it on top of all other content.
"""
from __future__ import annotations

import asyncio
import itertools
import json
import logging
import threading
import time
from dataclasses import asdict, dataclass, field

from PIL import Image, ImageDraw

from .config import DATA_DIR, Settings
from .display import Player
from .scene.pixelfont import DEFAULT_FONT, get_font
from .scene.render import draw_boxed_text, hex_rgb, text_width

log = logging.getLogger(__name__)

SETTINGS_FILE = DATA_DIR / "notifications.json"

_TICK = 1.0 / 30.0     # render cadence while a notification is up
_SLIDE = 0.28          # seconds for the slide in / slide out


@dataclass
class Notification:
    id: int
    title: str
    message: str
    source: str
    color: str          # hex accent bar
    duration: float     # seconds fully visible (excludes the slide in/out)
    priority: int
    created_at: float   # time.monotonic() when queued


@dataclass
class NotifSettings:
    enabled: bool = True
    default_duration: float = 6.0
    muted_sources: list = field(default_factory=list)
    min_priority: int = 0


def _load_settings() -> NotifSettings:
    try:
        d = json.loads(SETTINGS_FILE.read_text())
        return NotifSettings(
            enabled=bool(d.get("enabled", True)),
            default_duration=float(d.get("default_duration", 6.0)),
            muted_sources=list(d.get("muted_sources", [])),
            min_priority=int(d.get("min_priority", 0)),
        )
    except Exception:
        return NotifSettings()


class NotificationManager:
    def __init__(self, player: Player, settings: Settings) -> None:
        self._player = player
        self._settings = settings          # app Settings — for content_size
        self._cfg = _load_settings()
        self._ids = itertools.count(1)
        self._lock = threading.Lock()
        self._queue: list[Notification] = []
        self._current: Notification | None = None
        self._current_start = 0.0
        self._history: list[dict] = []
        self._overlay_on = False
        self._font = get_font(DEFAULT_FONT)
        self._task: asyncio.Task | None = None
        self._sources_seen: set[str] = set()

    # --- lifecycle ---
    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop(), name="notifications")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._player.clear_overlay()

    # --- API-facing ---
    def add(
        self,
        *,
        title: str,
        message: str = "",
        source: str = "app",
        color: str = "#ffb62e",
        duration: float | None = None,
        priority: int = 0,
    ) -> Notification | None:
        """Queue a notification. Returns None if it's filtered out (disabled,
        muted source, or below the priority floor)."""
        source = (source or "app").strip() or "app"
        self._sources_seen.add(source)
        if not self._cfg.enabled:
            return None
        if source in self._cfg.muted_sources:
            return None
        if int(priority) < self._cfg.min_priority:
            return None
        n = Notification(
            id=next(self._ids),
            title=(title or "").strip(),
            message=(message or "").strip(),
            source=source,
            color=color or "#ffb62e",
            duration=float(duration if duration is not None else self._cfg.default_duration),
            priority=int(priority),
            created_at=time.monotonic(),
        )
        with self._lock:
            self._queue.append(n)
            self._queue.sort(key=lambda x: (-x.priority, x.created_at))
        return n

    def dismiss(self, nid: int | None = None) -> None:
        """Dismiss one notification by id, or everything (current + queue) if
        nid is None."""
        with self._lock:
            if nid is None:
                self._current = None
                self._queue.clear()
            else:
                if self._current and self._current.id == nid:
                    self._current = None
                self._queue = [n for n in self._queue if n.id != nid]

    def update_settings(self, patch: dict) -> dict:
        with self._lock:
            if "enabled" in patch:
                self._cfg.enabled = bool(patch["enabled"])
            if "default_duration" in patch:
                self._cfg.default_duration = max(1.0, float(patch["default_duration"]))
            if "muted_sources" in patch and isinstance(patch["muted_sources"], list):
                self._cfg.muted_sources = [str(s) for s in patch["muted_sources"]]
            if "min_priority" in patch:
                self._cfg.min_priority = int(patch["min_priority"])
            cfg = asdict(self._cfg)
        try:
            SETTINGS_FILE.write_text(json.dumps(cfg, indent=2))
        except Exception as exc:
            log.warning("could not persist notification settings: %s", exc)
        return cfg

    def state(self) -> dict:
        with self._lock:
            return {
                "settings": asdict(self._cfg),
                "current": self._public(self._current) if self._current else None,
                "queued": [self._public(n) for n in self._queue],
                "history": list(self._history),
                "sources_seen": sorted(self._sources_seen),
            }

    @staticmethod
    def _public(n: Notification) -> dict:
        return {
            "id": n.id, "title": n.title, "message": n.message, "source": n.source,
            "color": n.color, "duration": n.duration, "priority": n.priority,
        }

    # --- loop ---
    async def _loop(self) -> None:
        while True:
            try:
                self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("notification tick failed")
            await asyncio.sleep(_TICK if self._current else 0.15)

    def _tick(self) -> None:
        now = time.monotonic()
        with self._lock:
            if self._current is None and self._queue:
                self._current = self._queue.pop(0)
                self._current_start = now
            cur = self._current
            start = self._current_start

        if cur is None:
            if self._overlay_on:
                self._player.clear_overlay()
                self._overlay_on = False
            return

        total = _SLIDE + cur.duration + _SLIDE
        elapsed = now - start
        if elapsed >= total:
            with self._lock:
                self._history.insert(0, self._public(cur))
                self._history = self._history[:20]
                if self._current is cur:
                    self._current = None
            return  # next tick promotes the next one (or clears the overlay)

        self._player.set_overlay(self._render(cur, elapsed, total))
        self._overlay_on = True

    # --- rendering ---
    def _render(self, n: Notification, elapsed: float, total: float) -> Image.Image:
        cw, ch = self._settings.content_size
        banh = max(16, min(ch, round(ch * 0.5)))

        # Slide offset: banner rises from below on the way in, drops on the way out.
        if elapsed < _SLIDE:
            off = round((1 - elapsed / _SLIDE) * banh)
        elif elapsed > total - _SLIDE:
            off = round((1 - (total - elapsed) / _SLIDE) * banh)
        else:
            off = 0

        # Draw the card on an opaque RGB image, then drop it into a transparent
        # panel-sized RGBA overlay at the slid position.
        card = Image.new("RGB", (cw, banh), (16, 16, 22))
        d = ImageDraw.Draw(card)
        accent = hex_rgb(n.color)
        d.rectangle([0, 0, 2, banh - 1], fill=accent)          # left accent bar
        d.line([0, 0, cw - 1, 0], fill=accent)                 # top hairline

        font = self._font
        pad_x = 6
        inner_x = 4 + pad_x
        inner_w = cw - inner_x - 3
        tscale = 2 if banh >= 34 else 1
        title_h = font.height * tscale + 2

        # Source tag, small + accent, top-right.
        tag = n.source.upper()[:10]
        tw = text_width(tag, 1, font)
        if tw < inner_w // 2:
            font.draw(card, cw - tw - 3, 2, tag, accent, 1)

        draw_boxed_text(
            card, inner_x, 2, inner_w - (tw + 4 if tw < inner_w // 2 else 0),
            title_h, n.title or n.source, (255, 255, 255), font, tscale, "left",
        )
        if n.message:
            draw_boxed_text(
                card, inner_x, 2 + title_h, inner_w, banh - title_h - 3,
                n.message, (198, 204, 214), font, 1, "left",
            )

        overlay = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        overlay.paste(card.convert("RGBA"), (0, ch - banh + off))
        return overlay
