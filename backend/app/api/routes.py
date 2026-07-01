"""HTTP API for the matrix controller."""
from __future__ import annotations

import io

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .. import power, settings_store
from ..config import settings
from ..display import Player
from ..imaging import Frame, render_to_frames, simulate_bit_depth
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


class SettingsUpdate(BaseModel):
    # Panel geometry / hardware.
    matrix_panels_wide: int | None = Field(None, ge=1, le=16)
    matrix_panels_tall: int | None = Field(None, ge=1, le=16)
    matrix_panel_cols: int | None = Field(None, ge=8, le=128)
    matrix_panel_rows: int | None = Field(None, ge=8, le=128)
    matrix_orientation: int | None = None  # 0/90/180/270
    matrix_panel_type: str | None = None
    matrix_gpio_slowdown: int | None = Field(None, ge=0, le=6)
    matrix_hardware_mapping: str | None = None
    matrix_brightness: int | None = Field(None, ge=0, le=100)
    matrix_pwm_bits: int | None = Field(None, ge=1, le=11)
    matrix_pwm_lsb_nanoseconds: int | None = Field(None, ge=50, le=500)
    matrix_limit_refresh_rate_hz: int | None = Field(None, ge=0, le=1000)
    # Music provider credentials / connection details. Blank secret = unchanged.
    plex_base_url: str | None = None
    plex_token: str | None = None
    vlc_base_url: str | None = None
    vlc_password: str | None = None
    lastfm_api_key: str | None = None
    lastfm_user: str | None = None
    # WLED connection.
    wled_base_url: str | None = None
    wled_sync_direction: str | None = None


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


def _simulate_panel(frames: list[Frame]) -> list[Frame]:
    """Apply the configured PWM colour-depth simulation so previews show what the
    panel will actually look like (only changes anything below 8 bits)."""
    bits = settings.matrix_pwm_bits
    if bits >= 11:
        return frames
    return [Frame(simulate_bit_depth(f.image, bits), f.duration_ms) for f in frames]


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
    opts = body.to_render_settings().to_options(*settings.content_size)
    frames = render_to_frames(item.original_path, opts)
    return _frames_response(_simulate_panel(frames))


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
    opts = item.settings.to_options(*settings.content_size)
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
    resp = _frames_response(_simulate_panel(frames))
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


# --- user-editable settings (credentials) ---
@router.get("/settings")
async def get_settings(req: Request):
    return settings_store.public_view()


_MUSIC_KEYS = {"plex_base_url", "plex_token", "vlc_base_url", "vlc_password",
               "lastfm_api_key", "lastfm_user"}
_WLED_KEYS = {"wled_base_url", "wled_sync_direction"}


@router.put("/settings")
async def update_settings(req: Request, body: SettingsUpdate):
    payload = body.model_dump(exclude_unset=True)
    view = settings_store.update(payload)
    keys = set(payload)

    # Apply what we can without a restart.
    if "matrix_brightness" in keys:
        _player(req).set_brightness(settings.matrix_brightness)

    if keys & _MUSIC_KEYS:
        poller = _poller(req)
        st = poller.status()
        if st["enabled"]:
            try:
                poller.configure(st["provider"], True)
            except ValueError as exc:
                raise HTTPException(400, str(exc))

    if keys & _WLED_KEYS:
        wled = _wled(req)
        st = wled.status()
        try:
            wled.configure(st["enabled"], settings.wled_base_url,
                           settings.wled_sync_direction)
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    view["restart_required"] = bool(keys & settings_store.RESTART_FIELDS)
    return view


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
            "panels_wide": settings.matrix_panels_wide,
            "panels_tall": settings.matrix_panels_tall,
            "panel_cols": settings.matrix_panel_cols,
            "panel_rows": settings.matrix_panel_rows,
            "total_panels": settings.total_panels,
            "orientation": settings.matrix_orientation,
            "pwm_bits": settings.matrix_pwm_bits,
        },
        "power": power.estimate(settings.total_panels),
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
