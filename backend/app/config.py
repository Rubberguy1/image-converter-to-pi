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
    matrix_width: int = 64
    matrix_height: int = 64

    # --- Driver selection ---
    # auto: use real hardware lib if importable, else emulator.
    matrix_backend: Literal["auto", "hardware", "emulator"] = "auto"

    # --- rpi-rgb-led-matrix tuning (only used by the hardware backend) ---
    # These map to RGBMatrixOptions. Defaults suit an Adafruit HAT/Bonnet + Pi 3 B.
    matrix_chain_length: int = 1
    matrix_parallel: int = 1
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

    @property
    def size(self) -> tuple[int, int]:
        return (self.matrix_width, self.matrix_height)


settings = Settings()

# Ensure storage exists.
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
