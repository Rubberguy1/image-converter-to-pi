"""HTTP API for the matrix controller."""
from __future__ import annotations

import io
import logging
import time

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

from .. import perf, power, settings_store
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


class WindowIn(BaseModel):
    # Pixel-lock window in source pixels; x/y may be negative or overflow.
    x: int = Field(..., ge=-8192, le=8192)
    y: int = Field(..., ge=-8192, le=8192)
    w: int = Field(..., gt=0, le=8192)
    h: int = Field(..., gt=0, le=8192)


class SettingsIn(BaseModel):
    fit: str = "cover"
    crop: CropIn | None = None
    brightness: float = Field(1.0, ge=0.1, le=3.0)
    contrast: float = Field(1.0, ge=0.1, le=3.0)
    saturation: float = Field(1.0, ge=0.0, le=3.0)
    nearest: bool = False
    window: WindowIn | None = None

    def to_render_settings(self) -> RenderSettings:
        return RenderSettings(
            fit=self.fit,
            crop=self.crop.model_dump() if self.crop else None,
            brightness=self.brightness,
            contrast=self.contrast,
            saturation=self.saturation,
            nearest=self.nearest,
            window=[self.window.x, self.window.y, self.window.w, self.window.h]
            if self.window
            else None,
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
    # Multi-panel wiring + per-panel order/rotation.
    matrix_chain_length: int | None = Field(None, ge=0, le=32)
    matrix_parallel: int | None = Field(None, ge=0, le=3)
    matrix_panel_map: list | None = None
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
    # Weather widget location.
    weather_lat: float | None = None
    weather_lon: float | None = None
    weather_unit: str | None = None


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
async def media_preview(
    req: Request,
    media_id: str,
    body: SettingsIn,
    w: int | None = None,
    h: int | None = None,
):
    """Render with the given settings so the UI can preview it. Defaults to the
    panel size (with colour-depth simulation); pass w/h to render at an arbitrary
    tile size (e.g. an image widget's box within a scene)."""
    item = _require(req, media_id)
    tile = bool(w and h)
    target = (w, h) if tile else settings.content_size
    opts = body.to_render_settings().to_options(*target)
    frames = render_to_frames(item.original_path, opts)
    return _frames_response(frames if tile else _simulate_panel(frames))


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


@router.websocket("/stream/ws")
async def stream_ws(ws: WebSocket):
    """Live screen mirror: the browser captures + crops + downscales the screen
    and streams panel-sized PNG frames here; each is pushed to the matrix. The
    Pi only ever receives the tiny cropped frames, never the whole screen."""
    await ws.accept()
    player = ws.app.state.player
    try:
        while True:
            data = await ws.receive_bytes()
            try:
                img = Image.open(io.BytesIO(data)).convert("RGB")
            except Exception:
                continue  # skip malformed frames
            target = settings.content_size
            if img.size != target:
                img = img.resize(target, Image.LANCZOS)
            player.set_live(img)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("screen stream error")
    finally:
        player.clear_live()


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


# --- custom scene / widgets ---
class SceneEnableIn(BaseModel):
    enabled: bool


class SceneValueIn(BaseModel):
    name: str
    value: str | int | float | None = None


def _scene(req: Request):
    return req.app.state.scene


@router.get("/scene")
async def get_scene(req: Request):
    runner = _scene(req)
    return {"scene": runner.scene.to_json(), "status": runner.status()}


@router.put("/scene")
async def put_scene(req: Request, body: dict):
    from ..scene import Scene

    runner = _scene(req)
    try:
        scene = Scene.from_json(body)
    except Exception as exc:
        raise HTTPException(400, f"invalid scene: {exc}")
    runner.set_scene(scene)
    return {"scene": runner.scene.to_json(), "status": runner.status()}


@router.post("/scene/enable")
async def enable_scene(req: Request, body: SceneEnableIn):
    _scene(req).set_enabled(body.enabled)
    return _scene(req).status()


@router.post("/scene/value")
async def push_scene_value(req: Request, body: SceneValueIn):
    _scene(req).push_value(body.name, body.value)
    return {"ok": True}


class SceneNameIn(BaseModel):
    name: str


@router.get("/scenes")
async def list_named_scenes(req: Request):
    from ..scene import list_scenes

    return {"scenes": list_scenes()}


@router.get("/fonts")
async def list_fonts(req: Request):
    """Available widget fonts (built-in + any dropped into app/scene/fonts/).
    Each entry's `height` lets the editor size the text box to the real, integer-
    scaled render height."""
    from ..scene import font_list

    return {"fonts": font_list()}


@router.post("/scenes/save")
async def save_named_scene(req: Request, body: SceneNameIn):
    from ..scene import save_named

    saved = save_named(body.name, _scene(req).scene)
    return {"ok": True, "name": saved}


@router.post("/scenes/load")
async def load_named_scene(req: Request, body: SceneNameIn):
    from ..scene import load_named

    scene = load_named(body.name)
    if scene is None:
        raise HTTPException(404, "scene not found")
    _scene(req).set_scene(scene)
    return {"scene": scene.to_json(), "status": _scene(req).status()}


@router.delete("/scenes/{name}")
async def delete_named_scene(req: Request, name: str):
    from ..scene import delete_named

    return {"ok": delete_named(name)}


@router.post("/scene/preview")
async def scene_preview(req: Request, body: dict):
    """Render a (possibly unsaved) scene for the editor's live preview. Returns an
    animated GIF (playing the scene's animation loop natively in the browser) when
    anything animates, otherwise a static PNG."""
    from ..scene import Scene

    runner = _scene(req)
    try:
        scene = Scene.from_json(body)
    except Exception as exc:
        raise HTTPException(400, f"invalid scene: {exc}")
    t0 = time.perf_counter()
    resp = _frames_response(runner.render_animation(scene))
    perf.preview.add((time.perf_counter() - t0) * 1000.0)
    resp.headers["Cache-Control"] = "no-store"
    return resp


class IdentifyIn(BaseModel):
    on: bool


@router.post("/matrix/identify")
async def matrix_identify(req: Request, body: IdentifyIn):
    """Show/hide the panel-identify pattern (numbers each physical panel) so a
    multi-panel layout can be configured."""
    _player(req).set_identify(body.on)
    return {"identifying": body.on}


@router.get("/perf")
async def perf_metrics(req: Request):
    """Live performance metrics — composite/preview timings, CPU%, load average.
    Watch this with a scene running to see the real load (on the Pi, load_avg is
    the key signal: 1.0 per fully-busy core, so ~4.0 saturates a Pi's 4 cores)."""
    snap = perf.snapshot()
    snap["matrix_backend"] = req.app.state.matrix.backend
    snap["scene_enabled"] = _scene(req).scene.enabled
    return snap


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
            "chain_length": settings.chain_length,
            "parallel": settings.parallel_chains,
            "identifying": _player(req).is_identifying(),
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
