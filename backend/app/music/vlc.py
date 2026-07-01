"""VLC now-playing provider via VLC's built-in HTTP interface.

Enable it in VLC: Tools > Preferences > (Show settings: All) > Interface > Main
interfaces > tick "Web", then set a password under Lua > Lua HTTP. VLC serves
status at http://<host>:8080/requests/status.json (HTTP Basic auth, empty
username + your password) and the current album art at /art.
"""
from __future__ import annotations

import logging

import httpx

from .base import MusicProvider, NowPlaying

log = logging.getLogger(__name__)


class VlcProvider(MusicProvider):
    name = "vlc"

    def __init__(self, base_url: str, password: str) -> None:
        self._base = base_url.rstrip("/")
        # VLC uses HTTP Basic auth with an empty username.
        self._client = httpx.AsyncClient(timeout=6.0, auth=("", password))

    async def fetch(self) -> NowPlaying:
        try:
            resp = await self._client.get(f"{self._base}/requests/status.json")
            resp.raise_for_status()
            status = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("vlc status fetch failed: %s", exc)
            return NowPlaying(playing=False)

        if status.get("state") != "playing":
            return NowPlaying(playing=False)

        meta = status.get("information", {}).get("category", {}).get("meta", {})
        title = meta.get("title") or meta.get("filename") or ""
        if not title:
            return NowPlaying(playing=False)

        # Fetch the current artwork bytes directly from VLC.
        art_bytes = None
        try:
            art_resp = await self._client.get(f"{self._base}/art")
            if art_resp.status_code == 200 and art_resp.content:
                art_bytes = art_resp.content
        except httpx.HTTPError:
            pass

        return NowPlaying(
            playing=True,
            artist=meta.get("artist", ""),
            album=meta.get("album", ""),
            title=title,
            art_bytes=art_bytes,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
