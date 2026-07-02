"""Playback engine.

A single background thread continuously renders the "effective" content to the
matrix. There are two content sources with a fixed priority:

    music override  >  manual selection

When the music poller pushes album art it takes over the panel; when music stops
the panel reverts to whatever was last shown manually (or blank). Content swaps
are thread-safe and wake the render loop immediately rather than waiting out the
current frame's duration.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

from PIL import Image

from ..imaging import Frame
from ..matrix import MatrixDisplay

log = logging.getLogger(__name__)


@dataclass
class NowShowing:
    source: str          # "manual" | "music" | "idle"
    label: str           # human label (filename / track)
    media_id: str | None
    frame_count: int
    animated: bool


class Player:
    def __init__(self, matrix: MatrixDisplay) -> None:
        self._matrix = matrix
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()

        self._manual: list[Frame] = []
        self._manual_meta = ("idle", "Nothing playing", None)
        self._music: list[Frame] | None = None
        self._music_meta = ("music", "", None)
        # Live screen-mirror frame (highest content priority below sleep). Each
        # streamed frame replaces the previous one in place.
        self._live: Image.Image | None = None
        # When music mode is on, the panel is dedicated to album art: the manual
        # image is suppressed entirely (blank between tracks), not used as a
        # fallback. Turning it off returns control to the manual selection.
        self._music_mode = False
        # Highest-priority state: when asleep the panel is blanked regardless of
        # music/manual content (used by e.g. WLED power sync). Waking restores
        # whatever was showing.
        self._asleep = False

        self._gen = 0
        self._thread = threading.Thread(target=self._run, name="player", daemon=True)

    # --- lifecycle ---
    def start(self) -> None:
        self._thread.start()

    def shutdown(self) -> None:
        self._stop.set()
        self._wake.set()
        self._thread.join(timeout=2)
        self._matrix.close()

    # --- content control ---
    def play(self, frames: list[Frame], label: str, media_id: str | None = None) -> None:
        with self._lock:
            self._manual = frames
            self._manual_meta = ("manual", label, media_id)
            self._gen += 1
        self._wake.set()
        log.info("play manual: %s (%d frames)", label, len(frames))

    def stop(self) -> None:
        """Clear the manual selection (and music) -> blank panel."""
        with self._lock:
            self._manual = []
            self._manual_meta = ("idle", "Nothing playing", None)
            self._music = None
            self._gen += 1
        self._wake.set()

    def enter_music_mode(self) -> None:
        """Dedicate the panel to album art. Immediately hides the custom image;
        shows blank until a track's artwork arrives."""
        with self._lock:
            self._music_mode = True
            self._music = None
            self._music_meta = ("music", "Waiting for playback…", None)
            self._gen += 1
        self._wake.set()
        log.info("music mode ON")

    def exit_music_mode(self) -> None:
        """Leave music mode and return control to the manual selection."""
        with self._lock:
            self._music_mode = False
            self._music = None
            self._gen += 1
        self._wake.set()
        log.info("music mode OFF")

    def set_music(self, frames: list[Frame], label: str) -> None:
        with self._lock:
            self._music = frames
            self._music_meta = ("music", label, None)
            self._gen += 1
        self._wake.set()
        log.info("play music: %s (%d frames)", label, len(frames))

    def clear_music(self) -> None:
        """Clear current artwork. Stays in music mode (blank), so the custom
        image is not revealed between tracks."""
        with self._lock:
            if self._music is None:
                return
            self._music = None
            self._gen += 1
        self._wake.set()

    def sleep(self) -> None:
        """Blank the panel (power-save), keeping current content to restore on
        wake. Highest priority — overrides music and manual."""
        with self._lock:
            if self._asleep:
                return
            self._asleep = True
            self._gen += 1
        self._wake.set()
        log.info("panel sleep")

    def wake(self) -> None:
        """Leave sleep and restore whatever was showing."""
        with self._lock:
            if not self._asleep:
                return
            self._asleep = False
            self._gen += 1
        self._wake.set()
        log.info("panel wake")

    def is_asleep(self) -> bool:
        with self._lock:
            return self._asleep

    def is_active(self) -> bool:
        """True when the panel is awake AND actually showing content — i.e. the
        display is 'on'. Used by WLED sync in the panel->lights direction."""
        with self._lock:
            if self._asleep:
                return False
            frames, _ = self._effective_locked()
            return len(frames) > 0

    def set_live(self, image: Image.Image) -> None:
        """Show a live streamed frame (screen mirror). Replaces the previous
        frame in place; starting a stream takes over the panel."""
        with self._lock:
            starting = self._live is None
            self._live = image
            if starting:
                self._gen += 1
        self._wake.set()

    def clear_live(self) -> None:
        with self._lock:
            if self._live is None:
                return
            self._live = None
            self._gen += 1
        self._wake.set()

    def set_brightness(self, value: int) -> None:
        self._matrix.set_brightness(value)

    # --- status ---
    def current_frames(self) -> list[Frame]:
        """A snapshot of the frames currently on the panel (empty if blank), so
        the UI can mirror the live output."""
        with self._lock:
            frames, _ = self._effective_locked()
            return list(frames)

    def now_showing(self) -> NowShowing:
        with self._lock:
            frames, (source, label, media_id) = self._effective_locked()
        return NowShowing(
            source=source,
            label=label,
            media_id=media_id,
            frame_count=len(frames),
            animated=len(frames) > 1,
        )

    # --- internals ---
    def _effective_locked(self):
        if self._asleep:
            return [], ("off", "Panel asleep", None)
        if self._live is not None:
            return [Frame(self._live)], ("live", "Screen mirror", None)
        if self._music is not None:
            return self._music, self._music_meta
        if self._music_mode:
            # Dedicated to music: blank rather than falling back to the image.
            return [], self._music_meta
        return self._manual, self._manual_meta

    def _run(self) -> None:
        idx = 0
        seen_gen = -1
        while not self._stop.is_set():
            with self._lock:
                frames, _ = self._effective_locked()
                gen = self._gen

            if gen != seen_gen:
                seen_gen = gen
                idx = 0

            if not frames:
                self._matrix.clear()
                self._wait(0.25)
                continue

            frame = frames[idx % len(frames)]
            try:
                self._matrix.set_image(frame.image)
            except Exception:  # never let a render error kill the loop
                log.exception("matrix render failed")

            if len(frames) == 1:
                self._wait(0.5)  # static: just poll for changes
                continue

            idx += 1
            self._wait(frame.duration_ms / 1000.0)

    def _wait(self, seconds: float) -> None:
        """Sleep up to `seconds`, returning early if content changed."""
        if self._wake.wait(seconds):
            self._wake.clear()
