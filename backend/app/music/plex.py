"""Plex now-playing provider.

Reads active sessions from your Plex Media Server and surfaces any music that is
currently playing, plus its album art. plexapi is synchronous so calls are run in
a worker thread.

Setup: set PLEX_BASE_URL (e.g. http://192.168.1.50:32400) and PLEX_TOKEN. Finding
your token: https://support.plex.tv/articles/204059436-finding-an-authentication-token/
"""
from __future__ import annotations

import asyncio
import logging

import httpx

from .base import MusicProvider, NowPlaying

log = logging.getLogger(__name__)


class PlexProvider(MusicProvider):
    name = "plex"

    def __init__(self, base_url: str, token: str) -> None:
        if not base_url or not token:
            raise ValueError("Plex provider requires PLEX_BASE_URL and PLEX_TOKEN")
        # Connect lazily (in the poll worker thread), NOT here — so switching
        # provider / saving a token never blocks the request or hard-fails on a
        # bad/expired token. Credential changes rebuild this object, so a new
        # token takes effect on the next poll with no app restart.
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._server = None
        self._client = httpx.AsyncClient(timeout=8.0)

    def _read_session(self) -> NowPlaying:
        if self._server is None:
            from plexapi.server import PlexServer  # imported lazily

            self._server = PlexServer(self._base_url, self._token)
        for session in self._server.sessions():
            if getattr(session, "type", None) != "track":
                continue
            if getattr(session, "isPlaying", None) is False:
                continue
            # Prefer album art (parentThumb) then track thumb.
            thumb = getattr(session, "parentThumb", None) or getattr(session, "thumb", None)
            art_url = self._server.url(thumb, includeToken=True) if thumb else None
            return NowPlaying(
                playing=True,
                artist=getattr(session, "grandparentTitle", "") or "",
                album=getattr(session, "parentTitle", "") or "",
                title=getattr(session, "title", "") or "",
                art_url=art_url,
            )
        return NowPlaying(playing=False)

    async def fetch(self) -> NowPlaying:
        try:
            return await asyncio.to_thread(self._read_session)
        except Exception as exc:  # plexapi raises various network errors
            log.debug("plex fetch failed: %s", exc)
            return NowPlaying(playing=False)

    async def aclose(self) -> None:
        await self._client.aclose()
