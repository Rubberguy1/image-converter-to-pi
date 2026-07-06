"""Widget drawing for the scene compositor."""
from __future__ import annotations

from datetime import datetime

from PIL import ImageDraw, ImageFont

_font_cache: dict[int, ImageFont.FreeTypeFont] = {}


def font(size: int):
    size = max(4, min(64, int(size)))
    if size not in _font_cache:
        try:
            _font_cache[size] = ImageFont.load_default(size=size)
        except TypeError:  # very old Pillow without size arg
            _font_cache[size] = ImageFont.load_default()
    return _font_cache[size]


def hex_rgb(color: str) -> tuple[int, int, int]:
    c = (color or "").lstrip("#")
    if len(c) == 6:
        try:
            return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))
        except ValueError:
            pass
    return (255, 255, 255)


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


def draw_widget(base, widget, ctx: dict) -> None:
    text = widget_text(widget, ctx)
    if not text:
        return
    draw = ImageDraw.Draw(base)
    f = font(widget.size)
    x, y = widget.x, widget.y
    if widget.align in ("center", "right"):
        bbox = draw.textbbox((0, 0), text, font=f)
        tw = bbox[2] - bbox[0]
        x = widget.x - (tw // 2 if widget.align == "center" else tw)
    draw.text((x, y), text, fill=hex_rgb(widget.color), font=f)
