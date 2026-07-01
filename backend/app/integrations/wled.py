"""WLED power sync.

Mirrors on/off state between the LED matrix panel and a WLED device using WLED's
HTTP JSON API (GET/POST /json/state). Three directions:

    panel_follows_wled : panel sleeps/wakes when the lights turn off/on
    wled_follows_panel : the lights turn off/on with the panel
    mirror             : both (edge-detected; WLED is the source of truth on sync)

HTTP polling keeps setup trivial (just the WLED IP). The design leaves room to
swap in MQTT later for instant, event-driven sync.
"""
from __future__ import annotations

import asyncio
import logging

import httpx

from ..config import Settings
from ..display import Player

log = logging.getLogger(__name__)


class WledClient:
    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=5.0)

    async def get_on(self) -> bool | None:
        """Current WLED on/off state, or None if unreachable."""
        try:
            resp = await self._client.get(f"{self._base}/json/state")
            resp.raise_for_status()
            return bool(resp.json().get("on"))
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("wled get_on failed: %s", exc)
            return None

    async def set_on(self, on: bool) -> bool:
        try:
            resp = await self._client.post(
                f"{self._base}/json/state", json={"on": bool(on)}
            )
            resp.raise_for_status()
            return True
        except httpx.HTTPError as exc:
            log.debug("wled set_on failed: %s", exc)
            return False

    async def aclose(self) -> None:
        await self._client.aclose()


class WledSync:
    def __init__(self, player: Player, settings: Settings) -> None:
        self._player = player
        self._settings = settings
        self._client: WledClient | None = None
        self._enabled = False
        self._base_url = settings.wled_base_url.rstrip("/")
        self._direction = settings.wled_sync_direction
        self._poll = settings.wled_poll_seconds

        self._last_wled_on: bool | None = None
        self._last_panel_active: bool | None = None
        self._wled_on: bool | None = None
        self._error: str | None = None
        self._task: asyncio.Task | None = None

    # --- lifecycle ---
    async def start(self) -> None:
        if self._settings.wled_enabled and self._base_url:
            try:
                self.configure(True, self._base_url, self._direction)
            except ValueError as exc:
                self._error = str(exc)
        self._task = asyncio.create_task(self._loop(), name="wled-sync")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._client:
            await self._client.aclose()

    # --- configuration (from API) ---
    def configure(
        self,
        enabled: bool,
        base_url: str | None = None,
        direction: str | None = None,
    ) -> None:
        if base_url is not None:
            self._base_url = base_url.rstrip("/")
        if direction is not None:
            self._direction = direction
        if enabled and not self._base_url:
            raise ValueError("WLED sync needs a base URL, e.g. http://192.168.1.60")

        # Replace the client (close the old one without blocking).
        if self._client:
            asyncio.create_task(self._client.aclose())
        self._client = WledClient(self._base_url) if self._base_url else None
        self._enabled = enabled and self._client is not None
        self._error = None
        self._last_wled_on = None
        self._last_panel_active = None

    def status(self) -> dict:
        return {
            "enabled": self._enabled,
            "base_url": self._base_url,
            "direction": self._direction,
            "wled_on": self._wled_on,
            "panel_active": self._player.is_active(),
            "error": self._error,
        }

    # --- internals ---
    async def _loop(self) -> None:
        while True:
            try:
                if self._enabled and self._client:
                    await self._tick()
                    await asyncio.sleep(self._poll)
                else:
                    await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("wled sync tick failed")
                await asyncio.sleep(self._poll)

    async def _tick(self) -> None:
        assert self._client is not None
        wled_on = await self._client.get_on()
        if wled_on is None:
            self._error = f"cannot reach WLED at {self._base_url}"
            return
        self._error = None
        self._wled_on = wled_on

        # Panel follows the lights (apply first so WLED wins in mirror mode).
        if self._direction in ("panel_follows_wled", "mirror"):
            if wled_on != self._last_wled_on:
                if wled_on:
                    self._player.wake()
                else:
                    self._player.sleep()
        self._last_wled_on = wled_on

        # Lights follow the panel.
        panel_active = self._player.is_active()
        if self._direction in ("wled_follows_panel", "mirror"):
            if panel_active != self._last_panel_active:
                await self._client.set_on(panel_active)
        self._last_panel_active = panel_active
