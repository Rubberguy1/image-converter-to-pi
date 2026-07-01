"""Image / GIF processing pipeline.

Turns an arbitrary-resolution source (PNG/JPG/GIF/WebP) plus an optional crop
rectangle and fit/colour options into a list of panel-sized RGB frames ready for
the matrix. Handles animated GIFs (with proper frame coalescing/disposal) and
applies small-panel colour tuning so artwork doesn't look washed out at 64×64.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Union

from PIL import Image, ImageDraw, ImageEnhance, ImageSequence

FitMode = Literal["cover", "contain", "stretch", "center", "integer"]

# Default frame duration when a GIF frame doesn't declare one.
_DEFAULT_FRAME_MS = 100
_MIN_FRAME_MS = 20  # clamp absurdly fast frames the panel can't keep up with


@dataclass
class CropRect:
    """Crop rectangle in normalised (0..1) coordinates relative to the source
    image, so it is independent of the source resolution. None = no crop."""
    x: float = 0.0
    y: float = 0.0
    w: float = 1.0
    h: float = 1.0

    def to_box(self, width: int, height: int) -> tuple[int, int, int, int]:
        left = max(0, round(self.x * width))
        top = max(0, round(self.y * height))
        right = min(width, round((self.x + self.w) * width))
        bottom = min(height, round((self.y + self.h) * height))
        # Guard against zero-area boxes.
        if right <= left:
            right = min(width, left + 1)
        if bottom <= top:
            bottom = min(height, top + 1)
        return (left, top, right, bottom)

    @property
    def is_identity(self) -> bool:
        return (self.x, self.y, self.w, self.h) == (0.0, 0.0, 1.0, 1.0)


@dataclass
class RenderOptions:
    target_width: int = 64
    target_height: int = 64
    fit: FitMode = "cover"
    crop: CropRect | None = None
    # Colour tuning (1.0 = unchanged). Small panels often benefit from a bump.
    brightness: float = 1.0
    contrast: float = 1.0
    saturation: float = 1.0
    background: tuple[int, int, int] = (0, 0, 0)  # letterbox fill for "contain"
    max_frames: int = 256  # safety cap for huge GIFs


@dataclass
class Frame:
    image: Image.Image       # RGB, exactly target size
    duration_ms: int = _DEFAULT_FRAME_MS


def _apply_crop(img: Image.Image, crop: CropRect | None) -> Image.Image:
    if crop is None or crop.is_identity:
        return img
    return img.crop(crop.to_box(img.width, img.height))


def _fit(img: Image.Image, opts: RenderOptions) -> Image.Image:
    tw, th = opts.target_width, opts.target_height
    sw, sh = img.width, img.height

    if opts.fit == "stretch":
        return img.resize((tw, th), Image.LANCZOS)

    if opts.fit == "center":
        # No scaling: place the source at its native pixel size, centred, on a
        # black panel. If it's larger than the panel it is centre-cropped.
        canvas = Image.new("RGB", (tw, th), opts.background)
        canvas.paste(img, ((tw - sw) // 2, (th - sh) // 2))
        return canvas

    if opts.fit == "integer":
        # Largest whole-number zoom that still fits, centred. NEAREST keeps pixel
        # art crisp. Falls back to 1x (centre-crop) if the source is bigger.
        scale = max(1, min(tw // sw, th // sh))
        nw, nh = sw * scale, sh * scale
        resized = img.resize((nw, nh), Image.NEAREST)
        canvas = Image.new("RGB", (tw, th), opts.background)
        canvas.paste(resized, ((tw - nw) // 2, (th - nh) // 2))
        return canvas

    if opts.fit == "contain":
        scale = min(tw / sw, th / sh)
        nw, nh = max(1, round(sw * scale)), max(1, round(sh * scale))
        resized = img.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGB", (tw, th), opts.background)
        canvas.paste(resized, ((tw - nw) // 2, (th - nh) // 2))
        return canvas

    # cover (default): fill the panel, centre-crop the overflow.
    scale = max(tw / sw, th / sh)
    nw, nh = max(1, round(sw * scale)), max(1, round(sh * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def _tune_colour(img: Image.Image, opts: RenderOptions) -> Image.Image:
    if opts.saturation != 1.0:
        img = ImageEnhance.Color(img).enhance(opts.saturation)
    if opts.contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(opts.contrast)
    if opts.brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(opts.brightness)
    return img


def _process_single(img: Image.Image, opts: RenderOptions) -> Image.Image:
    img = _apply_crop(img.convert("RGB"), opts.crop)
    img = _fit(img, opts)
    img = _tune_colour(img, opts)
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def _iter_coalesced(src: Image.Image):
    """Yield (full_rgba_frame, duration_ms) for an animated image, compositing
    partial frames onto the running canvas so GIF disposal methods render
    correctly."""
    canvas = Image.new("RGBA", src.size, (0, 0, 0, 0))
    for frame in ImageSequence.Iterator(src):
        duration = int(frame.info.get("duration", _DEFAULT_FRAME_MS) or _DEFAULT_FRAME_MS)
        rgba = frame.convert("RGBA")
        canvas = canvas.copy()
        canvas.alpha_composite(rgba)
        yield canvas.convert("RGB"), max(_MIN_FRAME_MS, duration)


Source = Union[Path, str, bytes, bytearray]


def _open(source: Source) -> Image.Image:
    if isinstance(source, (bytes, bytearray)):
        return Image.open(io.BytesIO(source))
    return Image.open(Path(source))


def render_to_frames(source: Source, opts: RenderOptions) -> list[Frame]:
    """Render a source (file path or raw image bytes) to panel-sized frames.

    A static image yields one frame; an animated GIF/WebP yields many.
    """
    with _open(source) as img:
        is_animated = getattr(img, "is_animated", False) and getattr(img, "n_frames", 1) > 1

        if not is_animated:
            return [Frame(_process_single(img, opts))]

        frames: list[Frame] = []
        for raw, duration in _iter_coalesced(img):
            frames.append(Frame(_process_single(raw, opts), duration))
            if len(frames) >= opts.max_frames:
                break
        return frames


@dataclass
class SpinOptions:
    """Parameters for the spinning-CD album-art effect."""
    frames: int = 36            # frames per full revolution (smoothness)
    revolution_seconds: float = 4.0  # time for one full spin
    supersample: int = 4        # render the disc this much larger, then downscale
    hole_ratio: float = 0.12    # spindle hole radius / disc radius (0 disables)


def _disc_mask(size: tuple[int, int], hole_ratio: float) -> Image.Image:
    """Circular alpha mask (white disc on black) with an optional centre hole."""
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, w - 1, h - 1], fill=255)
    if hole_ratio > 0:
        cx, cy = w / 2, h / 2
        r = (min(w, h) / 2) * hole_ratio
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)
    return mask


def render_disc_frames(source: Source, opts: RenderOptions, spin: SpinOptions) -> list[Frame]:
    """Render album art as a circular disc that rotates one full turn over
    `spin.frames` frames, so it loops seamlessly like a spinning CD/vinyl.

    The disc is always a TRUE circle of diameter min(width, height), centred on
    the panel with a black surround — so it stays round on non-square panels
    (e.g. 128×64) instead of stretching into an oval. It is built at supersampled
    resolution and downscaled with antialiasing for a smooth edge and rotation.
    Rotation is clockwise.
    """
    tw, th = opts.target_width, opts.target_height
    ss = max(1, spin.supersample)
    diameter = min(tw, th)          # circle fits the smaller dimension
    d = diameter * ss               # supersampled, square

    # Base album art as a SQUARE at high resolution (crop + colour tuning).
    big = RenderOptions(
        target_width=d,
        target_height=d,
        fit="cover",
        crop=opts.crop,
        brightness=opts.brightness,
        contrast=opts.contrast,
        saturation=opts.saturation,
    )
    base = render_to_frames(source, big)[0].image  # album art: use first frame

    # Cut it into a disc with a transparent surround + centre hole.
    disc = base.convert("RGBA")
    disc.putalpha(_disc_mask((d, d), spin.hole_ratio))

    n = max(1, spin.frames)
    frame_ms = max(_MIN_FRAME_MS, int(spin.revolution_seconds * 1000 / n))

    # Centre the circle on the full panel.
    off_x = (tw - diameter) // 2
    off_y = (th - diameter) // 2

    out: list[Frame] = []
    for i in range(n):
        angle = -360.0 * i / n  # negative => clockwise
        rotated = disc.rotate(angle, resample=Image.BICUBIC, expand=False)
        square = Image.new("RGBA", (d, d), (0, 0, 0, 255))
        square.alpha_composite(rotated)
        square = square.convert("RGB").resize((diameter, diameter), Image.LANCZOS)
        frame = Image.new("RGB", (tw, th), opts.background)
        frame.paste(square, (off_x, off_y))
        out.append(Frame(frame, frame_ms))
    return out


_PANEL_MAX_BITS = 11        # rgbmatrix default; treat as the "full" reference
_PANEL_GAMMA = 2.2          # approximates the library's luminance correction


def simulate_bit_depth(image: Image.Image, bits: int, gamma: float = _PANEL_GAMMA) -> Image.Image:
    """Approximate how the panel's PWM colour depth looks at `bits` bits/channel.

    The panel produces light with 2**bits linear PWM steps but is driven through a
    gamma curve, so reduced depth bands mainly in the DARK tones (many dark inputs
    collapse to the same few PWM steps). We model that by decoding to linear light,
    quantising to the PWM step count, and re-encoding — so 8-bit shows realistic
    shadow banding rather than looking identical to the 8-bit source. `bits` at or
    above the panel's native depth is returned unchanged.
    """
    bits = int(bits)
    if bits >= _PANEL_MAX_BITS:
        return image
    bits = max(1, bits)
    levels = (1 << bits) - 1
    lut = []
    for i in range(256):
        v = i / 255.0
        linear = v ** gamma                      # decode to linear light output
        quantised = round(linear * levels) / levels  # snap to available PWM steps
        out = quantised ** (1.0 / gamma)         # re-encode for display
        lut.append(round(out * 255))
    if image.mode != "RGB":
        image = image.convert("RGB")
    return image.point(lut * 3)


def make_thumbnail(source: Path | str, size: int = 128) -> Image.Image:
    """Small RGB preview of the (first frame of the) source for the library UI."""
    with Image.open(source) as img:
        thumb = img.convert("RGB")
        thumb.thumbnail((size, size), Image.LANCZOS)
        return thumb
