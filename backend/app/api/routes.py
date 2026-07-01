"""HTTP API for the matrix controller."""
from __future__ import annotations

import io

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..config import settings
from ..display import Player
from ..imaging import render_to_frames
from ..library import LibraryStore, MediaItem
from ..library.store import RenderSettings
from ..music import MusicPoller

router = APIRouter()

_MAX_UPLOAD = 25 * 1024 * 1024  # 25 MB
_ALLOWED_EXT = {"png", "jpg", "jpeg", "gif", "webp", "bmp"}


# --- request/response models ---
class CropIn(BaseModel):
    x: float = Field(0.0, ge=0, le=1)
    y: float = Field(0.0, ge=0, le=1)
    w: float = Field(1.0, gt=0, le=1)
    h: float = Field(1.0, gt=0, le=1)


class SettingsIn(BaseModel):
    fit: str = "cover"
    crop: CropIn | None = None
    brightness: float = Field(1.0, ge=0.1, le=3.0)
    contrast: float = Field(1.0, ge=0.1, le=3.0)
    saturation: float = Field(1.0, ge=0.0, le=3.0)

    def to_render_settings(self) -> RenderSettings:
        return RenderSettings(
            fit=self.fit,
            crop=self.crop.model_dump() if self.crop else None,
            brightness=self.brightness,
            contrast=self.contrast,
            saturation=self.saturation,
        )


class MusicConfigIn(BaseModel):
    provider: str = "none"
    enabled: bool = False
    spin: bool | None = None  # spinning-CD album-art effect; None = leave unchanged


class WledConfigIn(BaseModel):
    enabled: bool = False
    base_url: str | None = None
    direction: str | None = None  # panel_follows_wled | wled_follows_panel | mirror


class BrightnessIn(BaseModel):
    value: int = Field(..., ge=0, le=100)


# --- accessors ---
def _library(req: Request) -> LibraryStore:
    return req.app.state.library


def _player(req: Request) -> Player:
    return req.app.state.player


def _poller(req: Request) -> MusicPoller:
    return req.app.state.poller


def _wled(req: Request):
    return req.app.state.wled


def _item_json(item: MediaItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "ext": item.ext,
        "animated": item.animated,
        "width": item.width,
        "height": item.height,
        "created_at": item.created_at,
        "settings": {
            "fit": item.settings.fit,
            "crop": item.settings.crop,
            "brightness": item.settings.brightness,
            "contrast": item.settings.contrast,
            "saturation": item.settings.saturation,
        },
        "thumb_url": f"/api/media/{item.id}/thumb",
    }


def _require(req: Request, media_id: str) -> MediaItem:
    item = _library(req).get(media_id)
    if not item:
        raise HTTPException(404, "media not found")
    return item


def _frames_response(frames) -> Response:
    """Encode panel frames as an animated GIF (multi-frame) or PNG (single)."""
    buf = io.BytesIO()
    if len(frames) > 1:
        images = [f.image for f in frames]
        durations = [f.duration_ms for f in frames]
        images[0].save(
            buf,
            format="GIF",
            save_all=True,
            append_images=images[1:],
            duration=durations,
            loop=0,
            disposal=2,
        )
        return Response(buf.getvalue(), media_type="image/gif")
    frames[0].image.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")


# --- media library ---
@router.post("/media")
async def upload_media(req: Request, file: UploadFile = File(...)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(400, f"unsupported file type: .{ext}")
    data = await file.read()
    if len(data) > _MAX_UPLOAD:
        raise HTTPException(413, "file too large (max 25 MB)")
    try:
        item = _library(req).add(data, file.filename or f"upload.{ext}")
    except Exception as exc:
        raise HTTPException(400, f"invalid image: {exc}")
    return _item_json(item)


@router.get("/media")
async def list_media(req: Request):
    return [_item_json(i) for i in _library(req).list()]


@router.get("/media/{media_id}/thumb")
async def media_thumb(req: Request, media_id: str):
    item = _require(req, media_id)
    if not item.thumb_path.exists():
        raise HTTPException(404, "thumbnail missing")
    return Response(item.thumb_path.read_bytes(), media_type="image/png")


@router.get("/media/{media_id}/original")
async def media_original(req: Request, media_id: str):
    item = _require(req, media_id)
    mime = "image/gif" if item.ext == "gif" else f"image/{item.ext}"
    return Response(item.original_path.read_bytes(), media_type=mime)


@router.post("/media/{media_id}/preview")
async def media_preview(req: Request, media_id: str, body: SettingsIn):
    """Render at panel size with the given settings so the UI can preview exactly
    how it will look before pushing it. Animated sources return an animated GIF
    (so the preview plays); static sources return a PNG."""
    item = _require(req, media_id)
    opts = body.to_render_settings().to_options(*settings.size)
    frames = render_to_frames(item.original_path, opts)
    return _frames_response(frames)


@router.put("/media/{media_id}/settings")
async def update_media_settings(req: Request, media_id: str, body: SettingsIn):
    item = _library(req).update_settings(media_id, body.to_render_settings())
    if not item:
        raise HTTPException(404, "media not found")
    return _item_json(item)


@router.delete("/media/{media_id}")
async def delete_media(req: Request, media_id: str):
    player = _player(req)
    showing = player.now_showing()
    if showing.media_id == media_id:
        player.stop()
    if not _library(req).delete(media_id):
        raise HTTPException(404, "media not found")
    return {"ok": True}


# --- display control ---
@router.post("/display/{media_id}")
async def display_media(req: Request, media_id: str, body: SettingsIn | None = None):
    item = _require(req, media_id)
    if body is not None:
        _library(req).update_settings(media_id, body.to_render_settings())
        item = _require(req, media_id)
    # An explicit manual push wins: turn off music sync so the image actually
    # shows (otherwise music mode would keep the panel on album art).
    poller = _poller(req)
    music_disabled = False
    if poller.status()["enabled"]:
        poller.configure("none", False)
        music_disabled = True
    opts = item.settings.to_options(*settings.size)
    frames = render_to_frames(item.original_path, opts)
    _player(req).play(frames, item.name, media_id=item.id)
    return {
        "ok": True,
        "frames": len(frames),
        "animated": len(frames) > 1,
        "music_disabled": music_disabled,
    }


@router.post("/display/stop")
async def display_stop(req: Request):
    _player(req).stop()
    return {"ok": True}


@router.get("/display/current")
async def display_current(req: Request):
    """Live mirror of what's on the panel right now (animated GIF if animated,
    e.g. a spinning album disc). 204 when the panel is blank."""
    frames = _player(req).current_frames()
    if not frames:
        return Response(status_code=204)
    resp = _frames_response(frames)
    resp.headers["Cache-Control"] = "no-store"
    return resp


@router.post("/brightness")
async def set_brightness(req: Request, body: BrightnessIn):
    _player(req).set_brightness(body.value)
    return {"ok": True, "value": body.value}


@router.post("/display/sleep")
async def display_sleep(req: Request):
    _player(req).sleep()
    return {"ok": True, "asleep": True}


@router.post("/display/wake")
async def display_wake(req: Request):
    _player(req).wake()
    return {"ok": True, "asleep": False}


# --- WLED power sync ---
@router.get("/wled")
async def wled_status(req: Request):
    return _wled(req).status()


@router.post("/wled")
async def wled_configure(req: Request, body: WledConfigIn):
    try:
        _wled(req).configure(body.enabled, body.base_url, body.direction)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _wled(req).status()


# --- music ---
@router.get("/music")
async def music_status(req: Request):
    return _poller(req).status()


@router.post("/music")
async def music_configure(req: Request, body: MusicConfigIn):
    try:
        _poller(req).configure(body.provider, body.enabled, spin=body.spin)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _poller(req).status()


# --- overall status ---
@router.get("/status")
async def status(req: Request):
    matrix = req.app.state.matrix
    showing = _player(req).now_showing()
    return {
        "matrix": {
            "backend": matrix.backend,
            "width": matrix.width,
            "height": matrix.height,
            "brightness": matrix.get_brightness(),
        },
        "now_showing": {
            "source": showing.source,
            "label": showing.label,
            "media_id": showing.media_id,
            "animated": showing.animated,
            "frame_count": showing.frame_count,
        },
        "music": _poller(req).status(),
        "wled": _wled(req).status(),
    }
