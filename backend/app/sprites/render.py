"""Sprite drawing: slice a sheet into RGBA frames (cached, integer-scaled) and
draw pixel speech bubbles next to a sprite.

Everything here is pure Pillow and pixel-exact — sprites scale by whole
multiples with nearest-neighbour so pixel art stays crisp on the panel.
"""
from __future__ import annotations

import logging
import threading

from PIL import Image, ImageDraw

from .model import Sprite

# NOTE: text helpers (hex_rgb, wrap_text) come from ..scene.render, which is
# imported lazily inside the functions below — the scene package imports this
# module, so a top-level import here would be circular.

log = logging.getLogger(__name__)

MAX_SCALE = 16


def _key_transparent(img: Image.Image, key: tuple[int, int, int]) -> Image.Image:
    """Return an RGBA copy with every pixel equal to `key` made transparent."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    kr, kg, kb = key
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r == kr and g == kg and b == kb:
                px[x, y] = (r, g, b, 0)
    return rgba


def load_sheet(sp: Sprite, sheet_id: str | None = None) -> Image.Image:
    """One of the sprite's sheets as RGBA with the transparency rule applied."""
    from ..scene.render import hex_rgb

    path = sp.sheet_path(sheet_id)
    if path is None:
        raise FileNotFoundError(f"sprite {sp.id} has no sheets")
    with Image.open(path) as im:
        im.load()
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        src = im.convert("RGBA")
    t = (sp.transparent or "auto").lower()
    if t == "none":
        return src
    if t == "auto":
        if has_alpha:
            return src
        key = src.getpixel((0, 0))[:3]  # top-left pixel = background colour
        return _key_transparent(src, key)
    return _key_transparent(src, hex_rgb(t))


def anchor_offset(anchor: str, box_w: int, box_h: int, fw: int, fh: int) -> tuple[int, int]:
    """Where a fw×fh frame sits inside a box_w×box_h widget box."""
    a = anchor or "bottom-center"
    if a.endswith("left"):
        ox = 0
    elif a.endswith("right"):
        ox = box_w - fw
    else:
        ox = (box_w - fw) // 2
    if a.startswith("top"):
        oy = 0
    elif a.startswith("bottom"):
        oy = box_h - fh
    else:
        oy = (box_h - fh) // 2
    return ox, oy


class SpriteRenderer:
    """Frames of a sprite at a given scale/flip, cached by sprite version so an
    edit in the studio invalidates them automatically. Frames keep their own
    sizes (regions can differ); the runner places them by the sprite's anchor."""

    def __init__(self, store) -> None:
        self._store = store
        self._lock = threading.Lock()
        self._cache: dict[tuple, list[Image.Image]] = {}

    def frames(self, sp: Sprite, scale: int, flip: bool) -> list[Image.Image] | None:
        scale = max(1, min(MAX_SCALE, int(scale)))
        key = (sp.id, sp.version, scale, bool(flip))
        with self._lock:
            got = self._cache.get(key)
        if got is not None:
            return got
        sheets: dict[str, Image.Image] = {}
        try:
            for sh in sp.sheets:
                sheets[sh.id] = load_sheet(sp, sh.id)
        except Exception:
            log.exception("sprite sheet load failed: %s", sp.id)
            return None
        if not sheets:
            return None
        out: list[Image.Image] = []
        first_id = sp.sheets[0].id
        boxes = sp.frame_boxes() or [(first_id, (0, 0, sp.sheets[0].w, sp.sheets[0].h))]
        for sid, box in boxes:
            sheet = sheets.get(sid) or sheets[first_id]
            l, t, r, b = box
            l, t = max(0, l), max(0, t)
            r, b = min(sheet.width, max(l + 1, r)), min(sheet.height, max(t + 1, b))
            cell = sheet.crop((l, t, r, b))
            if flip:
                cell = cell.transpose(Image.FLIP_LEFT_RIGHT)
            if scale > 1:
                cell = cell.resize((cell.width * scale, cell.height * scale), Image.NEAREST)
            out.append(cell)
        with self._lock:
            # Bound the cache: a handful of (sprite, scale) combos is plenty.
            if len(self._cache) > 24:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = out
        return out


# ---- speech bubbles -----------------------------------------------------------

_PAD = 2        # inner padding (px)
_TAIL = 3       # tail length (px)
_MIN_W = 14     # don't bother with a bubble narrower than this


def _pick_side(side: str, anchor, cw: int, ch: int, line_h: int) -> str:
    """Choose where the bubble goes. "auto": beside the sprite when that column
    is comfortably wide (>= ~55% of the panel), otherwise the taller of
    above/below (full width reads far better on a tiny panel), then a narrow
    beside column, then a full-width strip at the top as a last resort."""
    ax, ay, aw, ah = anchor
    if side in ("left", "right", "above", "below"):
        return side
    right_w = cw - (ax + aw) - _TAIL
    left_w = ax - _TAIL
    beside = "right" if right_w >= left_w else "left"
    beside_w = max(right_w, left_w)
    above_h = ay - _TAIL
    below_h = ch - (ay + ah) - _TAIL
    min_h = line_h + 2 * _PAD + 2
    if beside_w >= max(_MIN_W + 2 * _PAD, round(cw * 0.55)):
        return beside
    if max(above_h, below_h) >= min_h:
        return "above" if above_h >= below_h else "below"
    if beside_w >= _MIN_W + 2 * _PAD:
        return beside
    return "top"


def reveal_lines(lines: list[str], reveal: int | None) -> list[str]:
    """Typewriter: the wrapped lines with only the first `reveal` visible
    characters (newlines don't count). None = everything. Returns the lines up
    to and including the one being typed (the last may be partial)."""
    if reveal is None:
        return list(lines)
    out: list[str] = []
    left = max(0, int(reveal))
    for ln in lines:
        if left >= len(ln):
            out.append(ln)
            left -= len(ln)
            if left == 0:
                break  # exactly at a line end: don't open an empty next line yet
            continue
        out.append(ln[:left])
        break
    if not out and lines:
        out.append("")
    return out


def visible_chars(text: str) -> int:
    return len((text or "").replace("\n", ""))


def _tail_side_for_box(box, anchor) -> str:
    """Which bubble edge faces the sprite when the bubble box is placed by hand."""
    bx, by, bw, bh = box
    ax, ay, aw, ah = anchor
    scx, scy = ax + aw / 2, ay + ah / 2
    if scy >= by + bh:
        return "above"   # bubble is above the sprite → tail on the bottom edge
    if scy < by:
        return "below"
    if scx < bx:
        return "right"   # sprite is left of the bubble → tail on the left edge
    return "left"


def draw_bubble(
    base: Image.Image,
    text: str,
    anchor: tuple[int, int, int, int],
    *,
    font,
    scale: int = 1,
    side: str = "auto",
    style: str = "light",
    page_ms: float = 2600.0,
    t_ms: float = 0.0,
    box: tuple[int, int, int, int] | None = None,
    reveal: int | None = None,
    radius: int = 2,
    tail: str = "auto",
    tail_at: float | None = None,
) -> None:
    """Draw a speech bubble containing `text` beside the `anchor` box
    (x, y, w, h) — or inside a fixed `box` placed by hand.

    Text is wrapped to the bubble width and shown as a **crawl**: lines fill
    the box top to bottom and, once full, the oldest line scrolls off the top
    as the next one arrives (video-game dialog style). `reveal` limits how many
    characters are visible so far (typewriter); None shows everything. `t_ms`
    is unused now but kept for callers that still pass it.

    `radius` rounds the corners (0 = square). `tail` picks the edge the tail
    sits on — "auto" (the edge facing the sprite), "left", "right", "top",
    "bottom" or "none" — and `tail_at` (0..1) its position along that edge;
    None aims it at the sprite."""
    from ..scene.render import wrap_text

    del page_ms, t_ms  # crawl replaced paging
    if not text:
        return
    cw, ch = base.size
    ax, ay, aw, ah = anchor
    if style == "dark":
        fill, border, fg = (0, 0, 0), (255, 255, 255), (255, 255, 255)
    else:
        fill, border, fg = (255, 255, 255), (255, 255, 255), (0, 0, 0)

    line_h = (font.height + 1) * scale
    glyph_h = font.height * scale

    if box is not None:
        bx, by, bw, bh = (int(v) for v in box)
        if bw < 2 * _PAD + 6 or bh < glyph_h + 2 * _PAD + 2:
            return
        where = _tail_side_for_box((bx, by, bw, bh), anchor)
        lines = wrap_text(text, font, scale, bw - 2 * _PAD - 2)
        per_page = max(1, (bh - 2 * _PAD - 2 + scale) // line_h)
    else:
        where = _pick_side(side, anchor, cw, ch, line_h)
        # Region the bubble may occupy.
        if where == "right":
            rx, ry, rw, rh = ax + aw + _TAIL, 0, cw - (ax + aw) - _TAIL, ch
        elif where == "left":
            rx, ry, rw, rh = 0, 0, ax - _TAIL, ch
        elif where == "above":
            rx, ry, rw, rh = 0, 0, cw, ay - _TAIL
        elif where == "below":
            rx, ry, rw, rh = 0, ay + ah + _TAIL, cw, ch - (ay + ah) - _TAIL
        else:  # "top": full-width strip over everything
            rx, ry, rw, rh = 0, 0, cw, ch
        rw, rh = int(rw), int(rh)
        inner_max_w = rw - 2 * _PAD - 2
        if inner_max_w < 4 or rh < glyph_h + 2 * _PAD + 2:
            return
        lines = wrap_text(text, font, scale, inner_max_w)
        if not lines:
            return
        # A bubble stays a bubble: at most ~60% of the panel tall; the crawl
        # scrolls the rest. Size it for the WHOLE text so it doesn't jitter
        # while typing.
        per_page = max(1, min((rh - 2 * _PAD - 2) // line_h, max(1, round(ch * 0.6 / line_h))))
        n_lines = min(len(lines), per_page)
        text_w = max(font.text_width(ln, scale) for ln in lines)
        bw = min(rw, text_w + 2 * _PAD + 2)
        bh = min(rh, n_lines * line_h - scale + 2 * _PAD + 2)
        # Place the bubble inside its region, hugging the sprite (beside:
        # centred on the sprite's upper half).
        if where == "right":
            bx, by = rx, ay + ah // 3 - bh // 2
        elif where == "left":
            bx, by = rx + rw - bw, ay + ah // 3 - bh // 2
        elif where == "above":
            bx, by = ax + aw // 2 - bw // 2, ry + rh - bh
        elif where == "below":
            bx, by = ax + aw // 2 - bw // 2, ry
        else:
            bx, by = 0, 0
        bx = max(rx, min(rx + rw - bw, bx))
        by = max(ry, min(ry + rh - bh, by))

    # Typewriter + crawl: reveal so far, then keep the last `per_page` lines.
    typed = reveal_lines(lines, reveal)
    shown = typed[-per_page:] if len(typed) > per_page else typed

    # --- the balloon: a rounded rectangle ---
    r = max(0, min(int(radius), (min(bw, bh) - 1) // 2))
    d = ImageDraw.Draw(base)
    if r > 0:
        d.rounded_rectangle([bx, by, bx + bw - 1, by + bh - 1], radius=r, fill=fill, outline=border)
    else:
        d.rectangle([bx, by, bx + bw - 1, by + bh - 1], fill=fill, outline=border)

    # --- the tail: which edge, and where along it ---
    edge = (tail or "auto").lower()
    if edge == "auto":
        edge = {"right": "left", "left": "right", "above": "bottom", "below": "top"}.get(where, "bottom")
    scx, scy = ax + aw // 2, ay + ah // 2
    ins = r + 1  # keep the tail off the rounded corners
    if edge in ("left", "right"):
        lo, hi = by + ins, by + bh - 1 - ins
        if hi >= lo:
            ty = round(lo + (hi - lo) * float(tail_at)) if tail_at is not None else scy
            ty = max(lo, min(hi, ty))
            if edge == "left":   # pointing left, away from the bubble
                d.polygon([(bx, ty - 1), (bx, ty + 1), (bx - _TAIL, ty)], fill=border)
                if fill != border:
                    d.line([(bx, ty - 1), (bx, ty + 1)], fill=fill)
            else:
                ex = bx + bw - 1
                d.polygon([(ex, ty - 1), (ex, ty + 1), (ex + _TAIL, ty)], fill=border)
                if fill != border:
                    d.line([(ex, ty - 1), (ex, ty + 1)], fill=fill)
    elif edge in ("top", "bottom"):
        lo, hi = bx + ins, bx + bw - 1 - ins
        if hi >= lo:
            tx = round(lo + (hi - lo) * float(tail_at)) if tail_at is not None else scx
            tx = max(lo, min(hi, tx))
            if edge == "bottom":  # pointing down
                ey = by + bh - 1
                d.polygon([(tx - 1, ey), (tx + 1, ey), (tx, ey + _TAIL)], fill=border)
                if fill != border:
                    d.line([(tx - 1, ey), (tx + 1, ey)], fill=fill)
            else:
                d.polygon([(tx - 1, by), (tx + 1, by), (tx, by - _TAIL)], fill=border)
                if fill != border:
                    d.line([(tx - 1, by), (tx + 1, by)], fill=fill)
    # edge == "none": no tail

    # --- text, clipped to the balloon's interior (respecting the corners) ---
    ty0 = by + 1 + _PAD
    iw, ih = max(1, bw - 2), max(1, bh - 2)
    inner = Image.new("RGB", (iw, ih), fill)
    for i, ln in enumerate(shown):
        if ln:
            font.draw(inner, _PAD, (ty0 - by - 1) + i * line_h, ln, fg, scale)
    mask = Image.new("L", (iw, ih), 0)
    md = ImageDraw.Draw(mask)
    if r > 1:
        md.rounded_rectangle([0, 0, iw - 1, ih - 1], radius=r - 1, fill=255)
    else:
        md.rectangle([0, 0, iw - 1, ih - 1], fill=255)
    base.paste(inner, (bx + 1, by + 1), mask)
