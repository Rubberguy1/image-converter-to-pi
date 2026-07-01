"""Last.fm now-playing provider.

This is the universal option: anything that scrobbles to Last.fm (YouTube Music
via a browser extension, VLC via a scrobbler plugin, desktop players, phones)
shows up here. We poll user.getRecentTracks and look for the track flagged
@attr nowplaying="true".

Setup: get an API key at https://www.last.fm/api/account/create and set
LASTFM_API_KEY + LASTFM_USER.
"""
from __future__ import annotations

import logging

import httpx

from .base import MusicProvider, NowPlaying

log = logging.getLogger(__name__)

_API = "https://ws.audioscrobbler.com/2.0/"


class LastFmProvider(MusicProvider):
    name = "lastfm"

    def __init__(self, api_key: str, user: str) -> None:
        if not api_key or not user:
            raise ValueError("Last.fm provider requires LASTFM_API_KEY and LASTFM_USER")
        self._api_key = api_key
        self._user = user
        self._client = httpx.AsyncClient(timeout=8.0)

    async def fetch(self) -> NowPlaying:
        params = {
            "method": "user.getrecenttracks",
            "user": self._user,
            "api_key": self._api_key,
            "format": "json",
            "limit": 1,
        }
        try:
            resp = await self._client.get(_API, params=params)
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("last.fm fetch failed: %s", exc)
            return NowPlaying(playing=False)

        tracks = data.get("recenttracks", {}).get("track", [])
        if isinstance(tracks, dict):
            tracks = [tracks]
        if not tracks:
            return NowPlaying(playing=False)

        track = tracks[0]
        nowplaying = track.get("@attr", {}).get("nowplaying") == "true"
        if not nowplaying:
            return NowPlaying(playing=False)

        # Pick the largest available image.
        art_url = None
        for img in reversed(track.get("image", [])):
            if img.get("#text"):
                art_url = img["#text"]
                break

        return NowPlaying(
            playing=True,
            artist=track.get("artist", {}).get("#text", ""),
            album=track.get("album", {}).get("#text", ""),
            title=track.get("name", ""),
            art_url=art_url,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
