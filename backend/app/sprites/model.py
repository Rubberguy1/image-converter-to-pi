"""Sprites: a character built from an existing sprite sheet.

A sprite is authored in the Sprite Studio and placed in scenes by a sprite
widget. It is made of:

  * a **sheet** (the uploaded image),
  * **regions** — crop rectangles on the sheet, each optionally *repeated* as a
    cols×rows grid (with gaps) to yield many frames. Frames are numbered in
    region order, row-major within a region,
  * **clips** — named animations: an ordered list of frame indices + fps + loop,
  * **triggers** — an ordered priority list mapping panel events (a notification,
    music playing, a track change, a pushed value, the time of day, an explicit
    "say") to the clip that should play; `idle_clip` is the fallback.

Layout:
    data/sprites/<id>/sheet.<ext>   the uploaded sheet
    data/sprites.json               index (regions + clips + triggers)
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

from PIL import Image

from ..config import DATA_DIR

log = logging.getLogger(__name__)

SPRITES_DIR = DATA_DIR / "sprites"
_INDEX_PATH = DATA_DIR / "sprites.json"

# Clip names the UI offers as presets. Any [A-Za-z0-9_-] name is allowed.
PRESET_CLIPS = ["idle", "talk", "dance", "wave", "sleep", "happy", "sad"]
# Trigger events the runner understands, in the order the UI lists them.
TRIGGER_EVENTS = ["say", "notification", "track", "music", "value", "time"]
ANCHORS = ["top-left", "top-center", "top-right", "center",
           "bottom-left", "bottom-center", "bottom-right"]
_CLIP_NAME = re.compile(r"[^A-Za-z0-9_-]")


def clean_clip_name(name: str) -> str:
    return _CLIP_NAME.sub("", (name or "").strip())[:32]


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


@dataclass
class Sheet:
    """One uploaded image belonging to a sprite. `file` is the name inside
    data/sprites/<sprite>/ (legacy single-sheet sprites keep "sheet.<ext>")."""
    id: str
    name: str
    file: str
    w: int
    h: int

    @property
    def ext(self) -> str:
        return Path(self.file).suffix.lower().lstrip(".") or "png"


@dataclass
class Region:
    """A crop on one of the sprite's sheets, repeated cols×rows (with gaps)
    into frames."""
    id: str
    sheet: str = ""       # Sheet.id; "" = the sprite's first sheet
    name: str = ""
    x: int = 0
    y: int = 0
    w: int = 16
    h: int = 16
    cols: int = 1
    rows: int = 1
    gap_x: int = 0
    gap_y: int = 0
    order: str = "rows"   # "rows" (row-major, like Aseprite "By Rows") | "cols"

    @property
    def count(self) -> int:
        return max(1, self.cols) * max(1, self.rows)

    def cells(self) -> list[tuple[int, int, int, int]]:
        """(l, t, r, b) boxes for every frame this region yields, numbered
        by rows (left→right, top→bottom) or by columns (top→bottom, left→right)."""
        out = []
        cols, rows = max(1, self.cols), max(1, self.rows)
        cell = lambda c, r: (  # noqa: E731
            self.x + c * (self.w + self.gap_x),
            self.y + r * (self.h + self.gap_y),
            self.x + c * (self.w + self.gap_x) + self.w,
            self.y + r * (self.h + self.gap_y) + self.h,
        )
        if self.order == "cols":
            for c in range(cols):
                for r in range(rows):
                    out.append(cell(c, r))
        else:
            for r in range(rows):
                for c in range(cols):
                    out.append(cell(c, r))
        return out


@dataclass
class Clip:
    frames: list[int] = field(default_factory=list)  # frame indices, in play order
    fps: float = 6.0
    loop: bool = True

    @property
    def period_ms(self) -> float:
        return len(self.frames) / max(0.5, self.fps) * 1000.0


@dataclass
class Trigger:
    """One rule: when `event` is happening, play `clip`. First match wins."""
    id: str
    event: str            # see TRIGGER_EVENTS
    clip: str = ""        # "" = fall through (say/notification/track fall back sensibly)
    params: dict = field(default_factory=dict)
    # params by event:
    #   track: {"seconds": 6}
    #   value: {"name": "battery", "op": "<", "value": 20}
    #   time:  {"from": "23:00", "to": "07:00"}


def default_triggers() -> list[Trigger]:
    return [
        Trigger(id=_new_id(), event="say", clip="talk"),
        Trigger(id=_new_id(), event="notification", clip="talk"),
        Trigger(id=_new_id(), event="track", clip="", params={"seconds": 6}),
        Trigger(id=_new_id(), event="music", clip="dance"),
    ]


@dataclass
class Sprite:
    id: str
    name: str
    sheets: list[Sheet] = field(default_factory=list)
    regions: list[Region] = field(default_factory=list)
    clips: dict[str, Clip] = field(default_factory=dict)
    triggers: list[Trigger] = field(default_factory=default_triggers)
    idle_clip: str = "idle"
    anchor: str = "bottom-center"   # how frames of different sizes sit in the widget box
    transparent: str = "auto"       # "auto" | "none" | "#rrggbb" colour key
    created_at: float = 0.0
    version: int = 1                # bumped on every edit → cache key for rendered frames

    # --- paths / sheets ---
    @property
    def dir(self) -> Path:
        return SPRITES_DIR / self.id

    def sheet(self, sheet_id: str | None) -> Sheet | None:
        """The sheet with this id, or the first sheet for ""/unknown ids."""
        for sh in self.sheets:
            if sh.id == sheet_id:
                return sh
        return self.sheets[0] if self.sheets else None

    def sheet_path(self, sheet_id: str | None = None) -> Path | None:
        sh = self.sheet(sheet_id)
        return self.dir / sh.file if sh else None

    # --- frames (numbered across every region, in order) ---
    def frame_boxes(self) -> list[tuple[str, tuple[int, int, int, int]]]:
        """[(sheet_id, (l, t, r, b)), ...] for every frame."""
        out: list[tuple[str, tuple[int, int, int, int]]] = []
        for reg in self.regions:
            sh = self.sheet(reg.sheet)
            sid = sh.id if sh else ""
            out.extend((sid, box) for box in reg.cells())
        return out

    @property
    def frame_count(self) -> int:
        return sum(r.count for r in self.regions)

    def frame_at(self, index: int) -> tuple[str, tuple[int, int, int, int]]:
        boxes = self.frame_boxes()
        if not boxes:
            sh = self.sheet(None)
            return (sh.id if sh else "", (0, 0, sh.w if sh else 1, sh.h if sh else 1))
        return boxes[max(0, min(len(boxes) - 1, index))]

    @property
    def box(self) -> tuple[int, int]:
        """The widget box at scale 1: the largest frame's size."""
        boxes = [b for _, b in self.frame_boxes()]
        if not boxes:
            sh = self.sheet(None)
            return (sh.w, sh.h) if sh else (16, 16)
        return (max(b[2] - b[0] for b in boxes), max(b[3] - b[1] for b in boxes))

    def clip_or_fallback(self, name: str | None) -> tuple[str, Clip]:
        """The named clip; else the idle clip; else the first clip; else a
        synthetic single-frame clip so a sprite with no clips still shows."""
        if name and name in self.clips:
            return name, self.clips[name]
        if self.idle_clip in self.clips:
            return self.idle_clip, self.clips[self.idle_clip]
        if "idle" in self.clips:
            return "idle", self.clips["idle"]
        if self.clips:
            first = next(iter(self.clips))
            return first, self.clips[first]
        return "", Clip(frames=[0], fps=1, loop=True)

    # --- (de)serialisation ---
    def to_json(self) -> dict:
        first = self.sheet(None)
        d = {
            "id": self.id,
            "name": self.name,
            "sheets": [
                {"id": sh.id, "name": sh.name, "w": sh.w, "h": sh.h,
                 "url": f"/api/sprites/{self.id}/sheets/{sh.id}?v={self.version}"}
                for sh in self.sheets
            ],
            # First-sheet size, kept for older callers.
            "sheet_w": first.w if first else 0,
            "sheet_h": first.h if first else 0,
            "regions": [asdict(r) for r in self.regions],
            "clips": {k: asdict(v) for k, v in self.clips.items()},
            "triggers": [asdict(t) for t in self.triggers],
            "idle_clip": self.idle_clip,
            "anchor": self.anchor,
            "transparent": self.transparent,
            "created_at": self.created_at,
            "version": self.version,
        }
        bw, bh = self.box
        d["frames"] = [{"sheet": sid, "x": b[0], "y": b[1], "w": b[2] - b[0], "h": b[3] - b[1]} for sid, b in self.frame_boxes()]
        d["frame_count"] = len(d["frames"])
        d["box"] = {"w": bw, "h": bh}
        d["sheet_url"] = f"/api/sprites/{self.id}/sheet?v={self.version}"
        d["thumb_url"] = f"/api/sprites/{self.id}/thumb?v={self.version}"
        return d

    @classmethod
    def from_json(cls, d: dict) -> "Sprite":
        sheets = [_sheet_from(x) for x in (d.get("sheets") or []) if isinstance(x, dict)]
        sheets = [x for x in sheets if x is not None]
        if not sheets:
            # Legacy single-sheet sprite: sheet.<ext> + sheet_w/sheet_h.
            ext = str(d.get("ext") or "png")
            sheets = [Sheet(id="main", name="sheet", file=f"sheet.{ext}",
                            w=int(d.get("sheet_w", 1)), h=int(d.get("sheet_h", 1)))]
        sheet_w, sheet_h = sheets[0].w, sheets[0].h
        regions = [_region_from(r) for r in (d.get("regions") or []) if isinstance(r, dict)]
        for r in regions:
            if not r.sheet:
                r.sheet = sheets[0].id
        if not regions and "regions" not in d:
            # Legacy uniform-grid sprite → one repeated region.
            fw = int(d.get("frame_w") or sheet_w)
            fh = int(d.get("frame_h") or sheet_h)
            m = int(d.get("margin", 0))
            s = int(d.get("spacing", 0))
            cols = max(1, (sheet_w - 2 * m + s) // max(1, fw + s))
            rows = max(1, (sheet_h - 2 * m + s) // max(1, fh + s))
            regions = [Region(id=_new_id(), sheet=sheets[0].id, name="grid", x=m, y=m, w=fw, h=fh, cols=cols, rows=rows, gap_x=s, gap_y=s)]
        clips = {}
        for name, c in (d.get("clips") or {}).items():
            cn = clean_clip_name(name)
            if cn and isinstance(c, dict):
                clips[cn] = Clip(
                    frames=[int(i) for i in (c.get("frames") or [])],
                    fps=float(c.get("fps", 6.0)),
                    loop=bool(c.get("loop", True)),
                )
        triggers = [_trigger_from(t) for t in d.get("triggers", None) or []] if "triggers" in d else default_triggers()
        triggers = [t for t in triggers if t is not None]
        anchor = str(d.get("anchor") or "bottom-center")
        return cls(
            id=str(d["id"]),
            name=str(d.get("name") or "sprite"),
            sheets=sheets,
            regions=regions,
            clips=clips,
            triggers=triggers,
            idle_clip=clean_clip_name(str(d.get("idle_clip") or "idle")) or "idle",
            anchor=anchor if anchor in ANCHORS else "bottom-center",
            transparent=str(d.get("transparent", "auto")),
            created_at=float(d.get("created_at", 0.0)),
            version=int(d.get("version", 1)),
        )


def _sheet_from(x: dict) -> Sheet | None:
    try:
        return Sheet(id=str(x["id"]), name=str(x.get("name") or "sheet")[:48],
                     file=str(x["file"]), w=int(x["w"]), h=int(x["h"]))
    except (KeyError, ValueError, TypeError):
        return None


def _region_from(r: dict) -> Region:
    return Region(
        id=str(r.get("id") or _new_id()),
        sheet=str(r.get("sheet") or ""),
        name=str(r.get("name") or "")[:32],
        x=int(r.get("x", 0)), y=int(r.get("y", 0)),
        w=max(1, int(r.get("w", 16))), h=max(1, int(r.get("h", 16))),
        cols=max(1, int(r.get("cols", 1))), rows=max(1, int(r.get("rows", 1))),
        gap_x=max(0, int(r.get("gap_x", 0))), gap_y=max(0, int(r.get("gap_y", 0))),
        order="cols" if str(r.get("order", "rows")) == "cols" else "rows",
    )


def _trigger_from(t: dict) -> Trigger | None:
    if not isinstance(t, dict):
        return None
    ev = str(t.get("event") or "")
    if ev not in TRIGGER_EVENTS:
        return None
    params = t.get("params") if isinstance(t.get("params"), dict) else {}
    return Trigger(id=str(t.get("id") or _new_id()), event=ev, clip=clean_clip_name(str(t.get("clip") or "")), params=dict(params))


def guess_grid(w: int, h: int) -> tuple[int, int]:
    """Best-effort frame size for a fresh sheet: a horizontal/vertical strip of
    squares, else the largest common square size that tiles it, else one frame."""
    if h > 0 and w % h == 0 and 1 < w // h <= 64:
        return (h, h)
    if w > 0 and h % w == 0 and 1 < h // w <= 64:
        return (w, w)
    for s in (128, 96, 64, 48, 32, 24, 16, 8):
        if w % s == 0 and h % s == 0 and (w // s) * (h // s) > 1:
            return (s, s)
    return (w, h)


class SpriteStore:
    """Disk-backed index of sprites. Thread-safe like the media library."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, Sprite] = {}
        self._load()

    # --- persistence ---
    def _load(self) -> None:
        try:
            if not _INDEX_PATH.exists():
                return
            raw = json.loads(_INDEX_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            log.warning("could not read sprites index (%s); starting empty", exc)
            return
        for entry in raw.get("items", []):
            try:
                sp = Sprite.from_json(entry)
                self._items[sp.id] = sp
            except (KeyError, TypeError, ValueError) as exc:
                log.warning("skipping malformed sprite entry: %s", exc)

    def _save_locked(self) -> None:
        payload = {"items": [self._raw(sp) for sp in self._items.values()]}
        tmp = _INDEX_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(_INDEX_PATH)

    @staticmethod
    def _raw(sp: Sprite) -> dict:
        return {
            "id": sp.id, "name": sp.name,
            "sheets": [asdict(sh) for sh in sp.sheets],
            "regions": [asdict(r) for r in sp.regions],
            "clips": {k: asdict(v) for k, v in sp.clips.items()},
            "triggers": [asdict(t) for t in sp.triggers],
            "idle_clip": sp.idle_clip, "anchor": sp.anchor,
            "transparent": sp.transparent,
            "created_at": sp.created_at, "version": sp.version,
        }

    # --- queries ---
    def list(self) -> list[Sprite]:
        with self._lock:
            return sorted(self._items.values(), key=lambda s: s.created_at, reverse=True)

    def get(self, sprite_id: str | None) -> Sprite | None:
        if not sprite_id:
            return None
        with self._lock:
            return self._items.get(sprite_id)

    # --- mutations ---
    @staticmethod
    def _write_sheet(sprite_dir: Path, data: bytes, filename: str) -> Sheet:
        """Store an uploaded image as a new Sheet (validated, size captured)."""
        ext = Path(filename).suffix.lower().lstrip(".") or "png"
        sid = _new_id()
        sprite_dir.mkdir(parents=True, exist_ok=True)
        f = sprite_dir / f"{sid}.{ext}"
        f.write_bytes(data)
        with Image.open(f) as img:
            img.verify()
        with Image.open(f) as img:
            w, h = img.size
        return Sheet(id=sid, name=(Path(filename).stem or "sheet")[:48], file=f.name, w=w, h=h)

    def add(self, data: bytes, filename: str, name: str | None = None) -> Sprite:
        sprite_id = uuid.uuid4().hex[:12]
        sheet = self._write_sheet(SPRITES_DIR / sprite_id, data, filename)
        fw, fh = guess_grid(sheet.w, sheet.h)
        region = Region(id=_new_id(), sheet=sheet.id, name="frames", x=0, y=0, w=fw, h=fh,
                        cols=max(1, sheet.w // fw), rows=max(1, sheet.h // fh))
        sp = Sprite(
            id=sprite_id,
            name=(name or Path(filename).stem or "sprite").strip()[:48],
            sheets=[sheet],
            regions=[region],
            created_at=time.time(),
        )
        # Every frame as one looping "idle" clip so the sprite shows something
        # the moment it's placed; the studio refines from there.
        sp.clips["idle"] = Clip(frames=list(range(region.count)), fps=6.0, loop=True)
        with self._lock:
            self._items[sprite_id] = sp
            self._save_locked()
        return sp

    def add_sheet(self, sprite_id: str, data: bytes, filename: str, name: str | None = None) -> tuple[Sprite, Sheet] | None:
        """Attach another sheet to an existing sprite. No regions are created;
        the studio opens the slicer for it."""
        with self._lock:
            sp = self._items.get(sprite_id)
            if not sp:
                return None
        sheet = self._write_sheet(sp.dir, data, filename)
        if name:
            sheet.name = name.strip()[:48] or sheet.name
        with self._lock:
            sp.sheets.append(sheet)
            sp.version += 1
            self._save_locked()
        return sp, sheet

    def remove_sheet(self, sprite_id: str, sheet_id: str) -> Sprite | None:
        """Drop a sheet plus the regions on it; clips are clamped to the frames
        that remain. The last sheet can't be removed (delete the sprite instead)."""
        with self._lock:
            sp = self._items.get(sprite_id)
            if not sp:
                return None
            sh = next((x for x in sp.sheets if x.id == sheet_id), None)
            if sh is None or len(sp.sheets) <= 1:
                return sp
            sp.sheets = [x for x in sp.sheets if x.id != sheet_id]
            sp.regions = [r for r in sp.regions if r.sheet != sheet_id]
            n = max(1, sp.frame_count)
            for c in sp.clips.values():
                c.frames = [max(0, min(n - 1, i)) for i in c.frames]
            sp.version += 1
            self._save_locked()
        try:
            (sp.dir / sh.file).unlink()
        except OSError:
            pass
        return sp

    def update(self, sprite_id: str, patch: dict) -> Sprite | None:
        """Apply an edit from the studio (name / regions / clips / triggers /
        anchor / transparency). Clip frame indices are clamped to the frames the
        regions yield so a removed region can't leave a clip pointing past the end."""
        with self._lock:
            sp = self._items.get(sprite_id)
            if not sp:
                return None
            if patch.get("name") is not None:
                sp.name = str(patch["name"]).strip()[:48] or sp.name
            if patch.get("transparent") is not None:
                t = str(patch["transparent"]).strip().lower()
                if t not in ("auto", "none") and not re.fullmatch(r"#[0-9a-f]{6}", t):
                    t = "auto"
                sp.transparent = t
            if patch.get("anchor") in ANCHORS:
                sp.anchor = patch["anchor"]
            if isinstance(patch.get("sheets"), list):
                # Only names are editable here (files come via add_sheet).
                names = {str(x.get("id")): str(x.get("name") or "")[:48] for x in patch["sheets"] if isinstance(x, dict)}
                for sh in sp.sheets:
                    if names.get(sh.id):
                        sh.name = names[sh.id]
            if isinstance(patch.get("regions"), list):
                regs = []
                for r in patch["regions"]:
                    if not isinstance(r, dict):
                        continue
                    reg = _region_from(r)
                    sh = sp.sheet(reg.sheet)
                    if sh is None:
                        continue
                    reg.sheet = sh.id
                    # Keep the region on its sheet.
                    reg.x = max(0, min(sh.w - 1, reg.x))
                    reg.y = max(0, min(sh.h - 1, reg.y))
                    reg.w = max(1, min(sh.w - reg.x, reg.w))
                    reg.h = max(1, min(sh.h - reg.y, reg.h))
                    regs.append(reg)
                sp.regions = regs
            if isinstance(patch.get("clips"), dict):
                clips: dict[str, Clip] = {}
                for name, c in patch["clips"].items():
                    cn = clean_clip_name(name)
                    if not cn or not isinstance(c, dict):
                        continue
                    frames = [int(i) for i in (c.get("frames") or []) if str(i).lstrip("-").isdigit()]
                    clips[cn] = Clip(
                        frames=frames,
                        fps=max(0.5, min(60.0, float(c.get("fps", 6.0)))),
                        loop=bool(c.get("loop", True)),
                    )
                sp.clips = clips
            if isinstance(patch.get("triggers"), list):
                sp.triggers = [t for t in (_trigger_from(x) for x in patch["triggers"]) if t is not None]
            if patch.get("idle_clip") is not None:
                sp.idle_clip = clean_clip_name(str(patch["idle_clip"])) or "idle"
            # Clamp every clip to the frames that exist now.
            n = max(1, sp.frame_count)
            for c in sp.clips.values():
                c.frames = [max(0, min(n - 1, i)) for i in c.frames]
            sp.version += 1
            self._save_locked()
            return sp

    def delete(self, sprite_id: str) -> bool:
        with self._lock:
            sp = self._items.pop(sprite_id, None)
            if not sp:
                return False
            self._save_locked()
        try:
            for p in sp.dir.glob("*"):
                p.unlink()
            sp.dir.rmdir()
        except OSError:
            pass
        return True
