"""Driver backed by the rgbmatrix API.

This works for BOTH the real Pi library (`rgbmatrix`, from hzeller's
rpi-rgb-led-matrix) and the `RGBMatrixEmulator` package, because the emulator is a
deliberate drop-in replacement exposing the same `RGBMatrix` / `RGBMatrixOptions`
classes. We pick which module to import based on configuration / availability.
"""
from __future__ import annotations

import importlib
import os
import threading

from PIL import Image

from ..config import settings
from .base import MatrixDisplay


def _load_module(prefer: str):
    """Return (module, backend_name).

    prefer: "hardware" | "emulator" | "auto"
    """
    if prefer in ("auto", "hardware"):
        try:
            mod = importlib.import_module("rgbmatrix")
            return mod, "hardware"
        except ImportError:
            if prefer == "hardware":
                raise RuntimeError(
                    "MATRIX_BACKEND=hardware but the 'rgbmatrix' module is not "
                    "installed. Build rpi-rgb-led-matrix on the Pi (see "
                    "docs/PI_SETUP.md) or use MATRIX_BACKEND=emulator."
                )
    # auto-fallback or explicit emulator
    mod = importlib.import_module("RGBMatrixEmulator")
    return mod, "emulator"


class RGBMatrixDriver(MatrixDisplay):
    def __init__(self) -> None:
        mod, backend = _load_module(settings.matrix_backend)
        self.backend = backend

        options = mod.RGBMatrixOptions()
        options.rows = settings.matrix_panel_rows       # per-panel height
        options.cols = settings.matrix_panel_cols       # per-panel width
        options.chain_length = settings.matrix_panels_wide
        options.parallel = settings.matrix_panels_tall
        options.brightness = settings.matrix_brightness

        # Hardware-only tuning. The emulator ignores unknown attributes, but we
        # guard anyway so a typo can't crash dev.
        if backend == "hardware":
            options.hardware_mapping = settings.matrix_hardware_mapping
            options.gpio_slowdown = settings.matrix_gpio_slowdown
            options.pwm_bits = settings.matrix_pwm_bits
            options.pwm_lsb_nanoseconds = settings.matrix_pwm_lsb_nanoseconds
            options.limit_refresh_rate_hz = settings.matrix_limit_refresh_rate_hz
            # Diagnostic: MATRIX_SHOW_REFRESH=1 makes the library print the live
            # refresh rate (Hz) to the log so you can see the real panel timing.
            if os.environ.get("MATRIX_SHOW_REFRESH", "").lower() in ("1", "true", "yes"):
                options.show_refresh_rate = True
            # Panel-specific quirks (FM6126A chips, multiplexing, row addressing).
            if settings.matrix_panel_type:
                options.panel_type = settings.matrix_panel_type
            if settings.matrix_multiplexing:
                options.multiplexing = settings.matrix_multiplexing
            if settings.matrix_row_address_type:
                options.row_address_type = settings.matrix_row_address_type
            # IMPORTANT: rgbmatrix drops root to the 'daemon' user after init by
            # default. This app must keep writing data/ (library, uploads) and
            # needs GPIO, so we keep privileges unless explicitly told otherwise.
            try:
                options.drop_privileges = bool(settings.matrix_drop_privileges)
            except AttributeError:
                pass

        self._matrix = mod.RGBMatrix(options=options)
        self.width = settings.matrix_width          # physical width
        self.height = settings.matrix_height        # physical height
        self._orientation = settings.matrix_orientation % 360
        self._brightness = settings.matrix_brightness
        self._lock = threading.Lock()
        # Double-buffered canvas avoids tearing on hardware.
        self._canvas = self._matrix.CreateFrameCanvas()

    def set_image(self, image: Image.Image) -> None:
        # Content is rendered at content_size; rotate it to the physical panel
        # orientation. PIL rotates counter-clockwise, so 90 here == a quarter
        # turn; pick 90 vs 270 for the direction your panel is mounted.
        if self._orientation:
            image = image.rotate(self._orientation, expand=True)
        if image.mode != "RGB":
            image = image.convert("RGB")
        with self._lock:
            self._canvas.SetImage(image)
            self._canvas = self._matrix.SwapOnVSync(self._canvas)

    def set_brightness(self, brightness: int) -> None:
        brightness = max(0, min(100, int(brightness)))
        with self._lock:
            self._matrix.brightness = brightness
            self._brightness = brightness

    def get_brightness(self) -> int:
        return self._brightness

    def clear(self) -> None:
        with self._lock:
            self._matrix.Clear()
            self._canvas.Clear()
