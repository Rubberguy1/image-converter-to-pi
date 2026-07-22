"""Application configuration, loaded from environment variables / .env.

All matrix and music settings live here so the same code runs on a dev machine
(emulator) and on the Pi (hardware) with only env differences.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MEDIA_DIR = DATA_DIR / "media"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    # --- Panel geometry ---
    # A "panel" is one physical module (usually 64x64). A wall is panels_wide ×
    # panels_tall of them. Total resolution is derived from these.
    matrix_panel_cols: int = 64   # per-panel width in pixels
    matrix_panel_rows: int = 64   # per-panel height in pixels
    matrix_panels_wide: int = 1   # LOGICAL wall: panels left-to-right
    matrix_panels_tall: int = 1   # LOGICAL wall: panels top-to-bottom
    matrix_orientation: int = 0   # single-panel display rotation: 0/90/180/270

    # --- Physical wiring (how the panels are cabled to the HAT/bonnet) ---
    # 0 = auto. chain_length = panels in one daisy-chain; parallel = how many
    # chains hang off the HAT's separate outputs. total = chain_length × parallel
    # must equal the logical panel count (panels_wide × panels_tall).
    matrix_chain_length: int = 0
    matrix_parallel: int = 0
    # Per-logical-cell mapping to physical panels + rotation. [] = identity
    # (cell k → physical k, no rotation). Each entry: {"physical": int, "rot": int}.
    matrix_panel_map: list = []

    # --- Driver selection ---
    # auto: use real hardware lib if importable, else emulator.
    matrix_backend: Literal["auto", "hardware", "emulator"] = "auto"

    # --- rpi-rgb-led-matrix tuning (only used by the hardware backend) ---
    # These map to RGBMatrixOptions. Defaults suit an Adafruit HAT/Bonnet.
    matrix_hardware_mapping: str = "adafruit-hat"  # or "adafruit-hat-pwm" after the solder mod
    matrix_gpio_slowdown: int = 2  # Pi 3 typically needs 1-2; Pi 4 needs 3-4
    matrix_pwm_bits: int = 11
    matrix_pwm_lsb_nanoseconds: int = 130
    matrix_brightness: int = 70  # 0-100, startup default
    matrix_limit_refresh_rate_hz: int = 0  # 0 = unlimited
    # Panel-specific quirks. Many 64x64 panels use FM6126A chips and show
    # garbled/red/half-lit output until you set panel_type="FM6126A".
    matrix_panel_type: str = ""       # "" = default, or "FM6126A" / "FM6127"
    matrix_multiplexing: int = 0      # 0 = direct; some panels need 1-17
    matrix_row_address_type: int = 0  # 0 = default; 1-4 for AB/ABC-addressed panels
    # Keep False: rgbmatrix would otherwise drop root to 'daemon' after init,
    # which breaks writing to data/ (library, uploads). This is a dedicated
    # appliance that runs as root for GPIO anyway.
    matrix_drop_privileges: bool = False

    # --- Music sync ---
    music_enabled: bool = False
    music_provider: Literal["none", "plex", "vlc", "lastfm"] = "none"
    music_poll_seconds: float = 4.0
    # Album-art "spinning CD" effect.
    music_spin: bool = True
    music_spin_seconds: float = 4.0   # seconds per full revolution
    music_spin_frames: int = 36       # frames per revolution (smoothness)

    # Plex
    plex_base_url: str = ""        # e.g. http://192.168.1.50:32400
    plex_token: str = ""

    # VLC HTTP interface (Tools > Preferences > All > Interface > Main > Lua HTTP)
    vlc_base_url: str = "http://localhost:8080"
    vlc_password: str = ""

    # Last.fm (universal: works with YouTube Music, VLC, etc. via scrobbling)
    lastfm_api_key: str = ""
    lastfm_user: str = ""

    # --- Custom scene / weather widget ---
    weather_lat: float = 0.0
    weather_lon: float = 0.0
    weather_unit: Literal["fahrenheit", "celsius"] = "fahrenheit"

    # --- WLED power sync ---
    # Mirror on/off state between the panel and a WLED device (HTTP JSON API).
    wled_enabled: bool = False
    wled_base_url: str = ""  # e.g. http://192.168.1.60
    # panel_follows_wled: panel sleeps/wakes with the lights.
    # wled_follows_panel: lights turn on/off with the panel.
    # mirror: both directions (best-effort; edge-detected to avoid loops).
    wled_sync_direction: Literal[
        "panel_follows_wled", "wled_follows_panel", "mirror"
    ] = "panel_follows_wled"
    wled_poll_seconds: float = 3.0

    # --- derived geometry ---
    @property
    def total_panels(self) -> int:
        return max(1, self.matrix_panels_wide) * max(1, self.matrix_panels_tall)

    @property
    def parallel_chains(self) -> int:
        """Physical parallel outputs used (HAT connectors). Defaults to the wall's
        row count — the common wiring (one chain per row) and the old behaviour, so
        existing walls keep working. Override with matrix_parallel if wired
        differently."""
        return max(1, self.matrix_parallel or self.matrix_panels_tall)

    @property
    def chain_length(self) -> int:
        """Physical daisy-chain length (panels per output). Defaults to the wall's
        column count (one chain per row)."""
        if self.matrix_chain_length:
            return max(1, self.matrix_chain_length)
        if self.matrix_parallel:  # parallel set explicitly → derive chain from it
            return max(1, self.total_panels // max(1, self.matrix_parallel))
        return max(1, self.matrix_panels_wide)

    @property
    def physical_size(self) -> tuple[int, int]:
        """The flat framebuffer the matrix library drives (chain × parallel)."""
        return (self.matrix_panel_cols * self.chain_length,
                self.matrix_panel_rows * self.parallel_chains)

    @property
    def matrix_width(self) -> int:
        """Physical panel width in pixels."""
        return self.matrix_panel_cols * self.matrix_panels_wide

    @property
    def matrix_height(self) -> int:
        """Physical panel height in pixels."""
        return self.matrix_panel_rows * self.matrix_panels_tall

    @property
    def size(self) -> tuple[int, int]:
        """Physical (width, height) of the panel."""
        return (self.matrix_width, self.matrix_height)

    @property
    def content_size(self) -> tuple[int, int]:
        """Size to render content (the logical wall). A single panel can swap
        axes for 90/270 rotation; a multi-panel wall renders upright and the
        driver rearranges/rotates each panel via the panel map."""
        if self.total_panels == 1 and self.matrix_orientation in (90, 270):
            return (self.matrix_height, self.matrix_width)
        return (self.matrix_width, self.matrix_height)


settings = Settings()

# Ensure storage exists.
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
