"""Media library: stores uploaded files + per-item render settings on disk.

Layout:
    data/media/<id>/original.<ext>   the uploaded file (any resolution)
    data/media/<id>/thumb.png        small preview for the gallery
    data/library.json                index of all items (metadata + settings)
"""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

from PIL import Image

from ..config import DATA_DIR, MEDIA_DIR
from ..imaging import CropRect, RenderOptions, make_thumbnail

log = logging.getLogger(__name__)

_INDEX_PATH = DATA_DIR / "library.json"


@dataclass
class RenderSettings:
    fit: str = "cover"
    crop: dict | None = None  # {"x","y","w","h"} normalised, or None
    brightness: float = 1.0
    contrast: float = 1.0
    saturation: float = 1.0
    nearest: bool = False  # nearest-neighbour resampling (crisp pixels)
    window: list | None = None  # pixel-lock 1:1 window [x, y, w, h] in source px

    def to_options(self, width: int, height: int) -> RenderOptions:
        crop = CropRect(**self.crop) if self.crop else None
        return RenderOptions(
            target_width=width,
            target_height=height,
            fit=self.fit,  # type: ignore[arg-type]
            crop=crop,
            brightness=self.brightness,
            contrast=self.contrast,
            saturation=self.saturation,
            nearest=self.nearest,
            window=tuple(self.window) if self.window else None,
        )


@dataclass
class MediaItem:
    id: str
    name: str            # original filename
    ext: str             # lowercase, no dot
    animated: bool
    width: int           # source width
    height: int          # source height
    created_at: float
    settings: RenderSettings = field(default_factory=RenderSettings)

    @property
    def dir(self) -> Path:
        return MEDIA_DIR / self.id

    @property
    def original_path(self) -> Path:
        return self.dir / f"original.{self.ext}"

    @property
    def thumb_path(self) -> Path:
        return self.dir / "thumb.png"

    def to_json(self) -> dict:
        d = asdict(self)
        return d


class LibraryStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, MediaItem] = {}
        self._load()

    # --- persistence ---
    def _load(self) -> None:
        # A broken/unreadable index must never crash startup — just start empty.
        try:
            if not _INDEX_PATH.exists():
                return
            raw = json.loads(_INDEX_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            log.warning("could not read library index (%s); starting empty", exc)
            return
        for entry in raw.get("items", []):
            try:
                settings = RenderSettings(**entry.pop("settings", {}))
                self._items[entry["id"]] = MediaItem(settings=settings, **entry)
            except (KeyError, TypeError) as exc:
                log.warning("skipping malformed library entry: %s", exc)

    def _save_locked(self) -> None:
        payload = {"items": [it.to_json() for it in self._items.values()]}
        tmp = _INDEX_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(_INDEX_PATH)

    # --- queries ---
    def list(self) -> list[MediaItem]:
        with self._lock:
            return sorted(self._items.values(), key=lambda i: i.created_at, reverse=True)

    def get(self, media_id: str) -> MediaItem | None:
        with self._lock:
            return self._items.get(media_id)

    # --- mutations ---
    def add(self, data: bytes, filename: str) -> MediaItem:
        ext = Path(filename).suffix.lower().lstrip(".") or "png"
        media_id = uuid.uuid4().hex[:12]
        item_dir = MEDIA_DIR / media_id
        item_dir.mkdir(parents=True, exist_ok=True)
        original = item_dir / f"original.{ext}"
        original.write_bytes(data)

        # Validate it is a real image and capture metadata.
        with Image.open(original) as img:
            img.verify()
        with Image.open(original) as img:
            width, height = img.size
            animated = getattr(img, "is_animated", False) and getattr(img, "n_frames", 1) > 1

        # Thumbnail for the gallery.
        make_thumbnail(original, 128).save(item_dir / "thumb.png")

        item = MediaItem(
            id=media_id,
            name=Path(filename).name,
            ext=ext,
            animated=animated,
            width=width,
            height=height,
            created_at=time.time(),
        )
        with self._lock:
            self._items[media_id] = item
            self._save_locked()
        return item

    def update_settings(self, media_id: str, settings: RenderSettings) -> MediaItem | None:
        with self._lock:
            item = self._items.get(media_id)
            if not item:
                return None
            item.settings = settings
            self._save_locked()
            return item

    def delete(self, media_id: str) -> bool:
        with self._lock:
            item = self._items.pop(media_id, None)
            if not item:
                return False
            self._save_locked()
        # Remove files outside the lock.
        try:
            for p in item.dir.glob("*"):
                p.unlink()
            item.dir.rmdir()
        except OSError:
            pass
        return True
