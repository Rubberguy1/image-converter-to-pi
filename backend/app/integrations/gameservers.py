"""Steam / Source game-server monitor.

Polls each configured server with the A2S query protocol (UDP) and raises a
notification when it comes online, goes offline, or (optionally) when the player
count changes. Feeds the NotificationManager.

Servers are addressed by host + QUERY port (the A2S port, which is often the game
port but sometimes offset — e.g. Valheim's query port is game port + 1).
"""
from __future__ import annotations

import asyncio
import itertools
import json
import logging
from dataclasses import asdict, dataclass

try:
    import a2s  # python-a2s
except ImportError:  # keeps the app running if the dep isn't installed yet
    a2s = None

from ..config import DATA_DIR

log = logging.getLogger(__name__)

CONFIG_FILE = DATA_DIR / "gameservers.json"


@dataclass
class Server:
    id: int
    name: str
    host: str
    query_port: int
    enabled: bool = True


@dataclass
class MonitorSettings:
    poll_seconds: float = 30.0
    notify_online: bool = True
    notify_offline: bool = True
    notify_join: bool = False
    notify_leave: bool = False


class GameServerMonitor:
    def __init__(self, notifications) -> None:
        self._notif = notifications
        self._servers: list[Server] = []
        self._cfg = MonitorSettings()
        self._ids = itertools.count(1)
        # id -> {online, players, max, map, srv_name, error}
        self._state: dict[int, dict] = {}
        self._task: asyncio.Task | None = None
        self._load()

    # --- persistence ---
    def _load(self) -> None:
        try:
            d = json.loads(CONFIG_FILE.read_text())
        except Exception:
            return
        s = d.get("settings", {})
        self._cfg = MonitorSettings(
            poll_seconds=float(s.get("poll_seconds", 30.0)),
            notify_online=bool(s.get("notify_online", True)),
            notify_offline=bool(s.get("notify_offline", True)),
            notify_join=bool(s.get("notify_join", False)),
            notify_leave=bool(s.get("notify_leave", False)),
        )
        for srv in d.get("servers", []):
            try:
                self._servers.append(Server(
                    id=int(srv["id"]), name=str(srv["name"]), host=str(srv["host"]),
                    query_port=int(srv["query_port"]), enabled=bool(srv.get("enabled", True)),
                ))
            except (KeyError, ValueError, TypeError):
                continue
        nxt = max((s.id for s in self._servers), default=0) + 1
        self._ids = itertools.count(nxt)

    def _save(self) -> None:
        data = {"settings": asdict(self._cfg), "servers": [asdict(s) for s in self._servers]}
        try:
            CONFIG_FILE.write_text(json.dumps(data, indent=2))
        except Exception as exc:
            log.warning("could not persist game servers: %s", exc)

    # --- lifecycle ---
    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop(), name="gameservers")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    # --- config (API-facing) ---
    def add_server(self, name: str, host: str, query_port: int) -> Server:
        s = Server(
            id=next(self._ids),
            name=(name or host).strip(),
            host=host.strip(),
            query_port=int(query_port),
        )
        self._servers.append(s)
        self._save()
        return s

    def update_server(self, sid: int, patch: dict) -> Server | None:
        for s in self._servers:
            if s.id == sid:
                if "name" in patch:
                    s.name = str(patch["name"]).strip() or s.name
                if "host" in patch:
                    s.host = str(patch["host"]).strip()
                if "query_port" in patch:
                    s.query_port = int(patch["query_port"])
                if "enabled" in patch:
                    s.enabled = bool(patch["enabled"])
                self._save()
                return s
        return None

    def remove_server(self, sid: int) -> bool:
        before = len(self._servers)
        self._servers = [s for s in self._servers if s.id != sid]
        self._state.pop(sid, None)
        if len(self._servers) != before:
            self._save()
            return True
        return False

    def update_settings(self, patch: dict) -> dict:
        if "poll_seconds" in patch:
            self._cfg.poll_seconds = max(5.0, float(patch["poll_seconds"]))
        for key in ("notify_online", "notify_offline", "notify_join", "notify_leave"):
            if key in patch:
                setattr(self._cfg, key, bool(patch[key]))
        self._save()
        return asdict(self._cfg)

    def status(self) -> dict:
        return {
            "settings": asdict(self._cfg),
            "available": a2s is not None,
            "servers": [
                {**asdict(s), "state": self._state.get(s.id, {"online": None})}
                for s in self._servers
            ],
        }

    async def query(self, host: str, port: int, timeout: float = 3.0) -> dict:
        if a2s is None:
            raise RuntimeError("python-a2s not installed")
        info = await a2s.ainfo((host, int(port)), timeout=timeout)
        return {
            "srv_name": info.server_name,
            "map": info.map_name,
            "players": info.player_count,
            "max": info.max_players,
            "game": info.game,
        }

    async def test(self, sid: int) -> dict:
        for s in self._servers:
            if s.id == sid:
                try:
                    return {"ok": True, **await self.query(s.host, s.query_port)}
                except Exception as exc:
                    return {"ok": False, "error": str(exc)[:120]}
        return {"ok": False, "error": "no such server"}

    # --- polling loop ---
    async def _loop(self) -> None:
        while True:
            try:
                await self._poll_all()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("game-server poll failed")
            await asyncio.sleep(self._cfg.poll_seconds)

    async def _poll_all(self) -> None:
        for s in list(self._servers):
            if s.enabled:
                await self._poll_one(s)

    async def _poll_one(self, s: Server) -> None:
        prev = self._state.get(s.id, {"online": None, "players": 0})
        try:
            info = await self.query(s.host, s.query_port)
            new = {"online": True, "error": None, **info}
        except Exception as exc:
            new = {
                "online": False, "players": 0,
                "max": prev.get("max", 0), "map": "",
                "srv_name": prev.get("srv_name", ""), "error": str(exc)[:80],
            }
        self._state[s.id] = new

        was = prev.get("online")
        if was is None:
            return  # first poll: record a baseline, don't fire a burst of alerts

        if new["online"] and was is False and self._cfg.notify_online:
            msg = f"{new.get('map', '')} · {new['players']}/{new['max']}".strip(" ·")
            self._notif.add(title=f"{s.name} online", message=msg,
                            source="gameserver", color="#33d6a6", priority=1)
        elif not new["online"] and was is True and self._cfg.notify_offline:
            self._notif.add(title=f"{s.name} offline", message="not responding",
                            source="gameserver", color="#ff5d5d", priority=1)
        elif new["online"] and was is True:
            delta = new["players"] - prev.get("players", 0)
            if delta > 0 and self._cfg.notify_join:
                self._notif.add(title=f"{s.name}: player joined",
                                message=f"{new['players']}/{new['max']}",
                                source="gameserver", color="#ffb62e")
            elif delta < 0 and self._cfg.notify_leave:
                self._notif.add(title=f"{s.name}: player left",
                                message=f"{new['players']}/{new['max']}",
                                source="gameserver", color="#ffb62e")
