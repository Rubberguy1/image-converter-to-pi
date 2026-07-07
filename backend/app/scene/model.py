"""Custom panel scene: a background plus positioned widgets.

A scene is composited on the Pi and shown persistently (the clock ticks and
weather refreshes even with no browser open). Stored in data/scene.json.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

from ..config import DATA_DIR

log = logging.getLogger(__name__)

_PATH = DATA_DIR / "scene.json"       # the active (currently shown) scene
_SCENES_DIR = DATA_DIR / "scenes"     # saved, named scenes for reuse

# Widget types the compositor knows how to draw.
WIDGET_TYPES = {"clock", "text", "weather", "value", "image", "music", "nowplaying"}


@dataclass
class Widget:
    id: str
    type: str
    x: int = 0
    y: int = 0
    color: str = "#FFFFFF"
    size: int = 8               # font pixel size
    align: str = "left"         # left | center | right
    hidden: bool = False        # kept in the scene but not drawn
    config: dict = field(default_factory=dict)  # type-specific options


@dataclass
class Background:
    type: str = "none"          # none | color | media
    color: str = "#000000"
    media_id: str | None = None
    fit: str = "cover"


@dataclass
class Scene:
    enabled: bool = False
    background: Background = field(default_factory=Background)
    widgets: list[Widget] = field(default_factory=list)

    def to_json(self) -> dict:
        return {
            "enabled": self.enabled,
            "background": asdict(self.background),
            "widgets": [asdict(w) for w in self.widgets],
        }

    @classmethod
    def from_json(cls, data: dict) -> "Scene":
        bg = Background(**{**Background().__dict__, **(data.get("background") or {})})
        widgets = []
        for w in data.get("widgets", []):
            if w.get("type") in WIDGET_TYPES and "id" in w:
                base = Widget(id=w["id"], type=w["type"]).__dict__
                widgets.append(Widget(**{**base, **{k: v for k, v in w.items() if k in base}}))
        return cls(enabled=bool(data.get("enabled", False)), background=bg, widgets=widgets)


def load_scene() -> Scene:
    if not _PATH.exists():
        return Scene()
    try:
        return Scene.from_json(json.loads(_PATH.read_text(encoding="utf-8")))
    except Exception as exc:
        log.warning("could not read scene.json (%s); starting empty", exc)
        return Scene()


def save_scene(scene: Scene) -> None:
    tmp = _PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(scene.to_json(), indent=2), encoding="utf-8")
    tmp.replace(_PATH)


# --- named scenes (saved for reuse) ---
def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9 _-]", "", name or "").strip()[:64] or "scene"


def list_scenes() -> list[str]:
    if not _SCENES_DIR.exists():
        return []
    return sorted(p.stem for p in _SCENES_DIR.glob("*.json"))


def save_named(name: str, scene: Scene) -> str:
    _SCENES_DIR.mkdir(parents=True, exist_ok=True)
    safe = _safe_name(name)
    (_SCENES_DIR / f"{safe}.json").write_text(
        json.dumps(scene.to_json(), indent=2), encoding="utf-8"
    )
    return safe


def load_named(name: str) -> Scene | None:
    p = _SCENES_DIR / f"{_safe_name(name)}.json"
    if not p.exists():
        return None
    try:
        return Scene.from_json(json.loads(p.read_text(encoding="utf-8")))
    except Exception as exc:
        log.warning("could not load scene '%s': %s", name, exc)
        return None


def delete_named(name: str) -> bool:
    p = _SCENES_DIR / f"{_safe_name(name)}.json"
    if p.exists():
        p.unlink()
        return True
    return False
