"""Widget drawing for the scene compositor — crisp, integer-scaled pixel text.

Text widgets have an explicit w×h box: the font size is independent of the box,
text word-wraps to fit the box width, and lines past the box height are clipped.
"""
from __future__ import annotations

from datetime import datetime

from .pixelfont import DEFAULT_FONT, get_font


def hex_rgb(color: str) -> tuple[int, int, int]:
    c = (color or "").lstrip("#")
    if len(c) == 6:
        try:
            return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))
        except ValueError:
            pass
    return (255, 255, 255)


def scale_for(size: int, font) -> int:
    """Whole-number scale so glyphs stay pixel-aligned. `size` is target height."""
    return max(1, round(int(size) / font.height))


def text_width(text: str, scale: int, font) -> int:
    return font.text_width(text, scale)


def draw_pixel_text(base, x: int, y: int, text: str, color, scale: int, font) -> None:
    font.draw(base, x, y, text, color, scale)


def widget_font(widget):
    return get_font((widget.config or {}).get("font", DEFAULT_FONT))


# ---- word wrapping + boxed text ---------------------------------------------

def _fit_prefix(s: str, font, scale: int, max_w: int) -> int:
    """Largest prefix length of `s` whose rendered width fits `max_w` (>=1)."""
    i = 1
    while i < len(s) and font.text_width(s[: i + 1], scale) <= max_w:
        i += 1
    return i


def wrap_text(text: str, font, scale: int, max_w: int) -> list[str]:
    """Word-wrap `text` to fit `max_w` pixels. Honours explicit newlines, and
    hard-breaks any single word too long to fit on its own."""
    lines: list[str] = []
    for para in str(text).split("\n"):
        if not para:
            lines.append("")
            continue
        line = ""
        for word in para.split(" "):
            trial = word if not line else f"{line} {word}"
            if font.text_width(trial, scale) <= max_w:
                line = trial
                continue
            if line:
                lines.append(line)
                line = ""
            while len(word) > 1 and font.text_width(word, scale) > max_w:
                cut = _fit_prefix(word, font, scale, max_w)
                lines.append(word[:cut])
                word = word[cut:]
            line = word
        lines.append(line)
    return lines


def draw_boxed_text(base, x, y, w, h, text, color, font, scale, align) -> None:
    """Draw `text` wrapped into a w×h box at (x, y). Lines that would spill past
    the box bottom are clipped (not drawn)."""
    w, h = int(w), int(h)
    if w <= 0 or h <= 0 or not text:
        return
    line_h = (font.height + 1) * scale
    glyph_h = font.height * scale
    cy = 0
    for line in wrap_text(text, font, scale, w):
        if cy + glyph_h > h:
            break  # next line won't fit vertically → clip
        if line:
            lw = font.text_width(line, scale)
            if align == "center":
                lx = (w - lw) // 2
            elif align == "right":
                lx = w - lw
            else:
                lx = 0
            font.draw(base, x + lx, y + cy, line, color, scale)
        cy += line_h


def box_for(widget, cw: int | None, ch: int | None) -> tuple[int, int]:
    """The widget's text-box size, defaulting to the remaining panel area."""
    cfg = widget.config or {}
    w = int(cfg.get("w") or 0) or max(1, (cw or 64) - int(widget.x))
    h = int(cfg.get("h") or 0) or max(1, (ch or 64) - int(widget.y))
    return w, h


# ---- widget text ------------------------------------------------------------

def widget_text(widget, ctx: dict) -> str:
    t = widget.type
    if t == "clock":
        return datetime.now().strftime(widget.config.get("format", "%H:%M"))
    if t == "text":
        return str(widget.config.get("text", ""))
    if t == "weather":
        w = ctx.get("weather")
        if not w:
            return "--°"
        return f"{round(w['temp'])}°{w.get('unit', '')}"
    if t == "value":
        name = widget.config.get("name", "")
        v = ctx.get("values", {}).get(name)
        label = widget.config.get("label", "")
        suffix = widget.config.get("suffix", "")
        if v is None:
            return f"{label}--"
        return f"{label}{v}{suffix}"
    return ""


def draw_widget(base, widget, ctx: dict, cw: int | None = None, ch: int | None = None) -> None:
    text = widget_text(widget, ctx)
    if not text:
        return
    font = widget_font(widget)
    scale = scale_for(widget.size, font)
    w, h = box_for(widget, cw, ch)
    draw_boxed_text(base, int(widget.x), int(widget.y), w, h, text,
                    hex_rgb(widget.color), font, scale, widget.align)
