"""Bitmap fonts for the scene widgets.

Real pixel glyphs (no antialiasing) so text stays crisp on the LED matrix, and
every font scales by whole integers so edges stay pixel-aligned.

Two kinds of font are supported and share one interface (draw / text_width /
height):
  * EmbeddedFont — glyphs authored here as ASCII art (the built-in "5x7").
  * FreeTypeFont — a bitmap/pixel font FILE (.bdf/.pcf/.ttf/.otf) dropped into
    app/scene/fonts/. It is rendered 1-bit (no AA) at its native pixel size,
    then integer-upscaled, so it stays just as crisp.

To ADD A FONT: either add a glyph table + EmbeddedFont below, or drop a pixel
font file into app/scene/fonts/ (see that folder's README). Fonts are picked up
automatically and offered per-widget in the editor.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

log = logging.getLogger(__name__)

GLYPH_W = 5
GLYPH_H = 7
ADVANCE = GLYPH_W + 1  # 1px inter-glyph gap

FONTS_DIR = Path(__file__).resolve().parent / "fonts"

# Each glyph: 7 rows, 5 columns. '#' = lit pixel, space = off.
_ART: dict[str, tuple[str, ...]] = {
    " ": ("     ", "     ", "     ", "     ", "     ", "     ", "     "),
    "!": ("  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "),
    '"': (" # # ", " # # ", "     ", "     ", "     ", "     ", "     "),
    "#": (" # # ", " # # ", "#####", " # # ", "#####", " # # ", " # # "),
    "$": ("  #  ", " ####", "# #  ", " ### ", "  # #", "#### ", "  #  "),
    "%": ("##   ", "##  #", "   # ", "  #  ", " #   ", "#  ##", "   ##"),
    "&": (" ##  ", "#  # ", " ##  ", " ## #", "#  # ", "#   #", " ## #"),
    "'": ("  #  ", "  #  ", "     ", "     ", "     ", "     ", "     "),
    "(": ("   # ", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   # "),
    ")": (" #   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", " #   "),
    "*": ("     ", " # # ", " ### ", "#####", " ### ", " # # ", "     "),
    "+": ("     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "),
    ",": ("     ", "     ", "     ", "     ", "  #  ", "  #  ", " #   "),
    "-": ("     ", "     ", "     ", "#####", "     ", "     ", "     "),
    ".": ("     ", "     ", "     ", "     ", "     ", "  #  ", "  #  "),
    "/": ("    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "),
    "0": (" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "),
    "1": ("  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "),
    "2": (" ### ", "#   #", "   # ", "  #  ", " #   ", "#    ", "#####"),
    "3": ("#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "),
    "4": ("   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "),
    "5": ("#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "),
    "6": ("  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "),
    "7": ("#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "),
    "8": (" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "),
    "9": (" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "),
    ":": ("     ", "  #  ", "  #  ", "     ", "  #  ", "  #  ", "     "),
    ";": ("     ", "  #  ", "  #  ", "     ", "  #  ", "  #  ", " #   "),
    "<": ("   # ", "  #  ", " #   ", "#    ", " #   ", "  #  ", "   # "),
    "=": ("     ", "     ", "#####", "     ", "#####", "     ", "     "),
    ">": (" #   ", "  #  ", "   # ", "    #", "   # ", "  #  ", " #   "),
    "?": (" ### ", "#   #", "   # ", "  #  ", "  #  ", "     ", "  #  "),
    "@": (" ### ", "#   #", "# ###", "# # #", "# ###", "#    ", " ### "),
    "A": (" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"),
    "B": ("#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "),
    "C": (" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "),
    "D": ("#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "),
    "E": ("#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"),
    "F": ("#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "),
    "G": (" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####"),
    "H": ("#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"),
    "I": (" ### ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "),
    "J": ("  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "),
    "K": ("#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"),
    "L": ("#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"),
    "M": ("#   #", "## ##", "# # #", "#   #", "#   #", "#   #", "#   #"),
    "N": ("#   #", "#   #", "##  #", "# # #", "#  ##", "#   #", "#   #"),
    "O": (" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "),
    "P": ("#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "),
    "Q": (" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"),
    "R": ("#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"),
    "S": (" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "),
    "T": ("#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "),
    "U": ("#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "),
    "V": ("#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "),
    "W": ("#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"),
    "X": ("#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"),
    "Y": ("#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "),
    "Z": ("#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"),
    "[": (" ### ", " #   ", " #   ", " #   ", " #   ", " #   ", " ### "),
    "\\": ("#    ", "#    ", " #   ", "  #  ", "   # ", "    #", "    #"),
    "]": (" ### ", "   # ", "   # ", "   # ", "   # ", "   # ", " ### "),
    "^": ("  #  ", " # # ", "#   #", "     ", "     ", "     ", "     "),
    "_": ("     ", "     ", "     ", "     ", "     ", "     ", "#####"),
    "`": (" #   ", "  #  ", "     ", "     ", "     ", "     ", "     "),
    "a": ("     ", "     ", " ### ", "    #", " ####", "#   #", " ####"),
    "b": ("#    ", "#    ", "#### ", "#   #", "#   #", "#   #", "#### "),
    "c": ("     ", "     ", " ### ", "#    ", "#    ", "#   #", " ### "),
    "d": ("    #", "    #", " ####", "#   #", "#   #", "#   #", " ####"),
    "e": ("     ", "     ", " ### ", "#   #", "#####", "#    ", " ### "),
    "f": ("  ## ", " #  #", " #   ", "#### ", " #   ", " #   ", " #   "),
    "g": ("     ", " ####", "#   #", "#   #", " ####", "    #", " ### "),
    "h": ("#    ", "#    ", "#### ", "#   #", "#   #", "#   #", "#   #"),
    "i": ("  #  ", "     ", " ##  ", "  #  ", "  #  ", "  #  ", " ### "),
    "j": ("   # ", "     ", "  ## ", "   # ", "   # ", "#  # ", " ##  "),
    "k": ("#    ", "#    ", "#  # ", "# #  ", "##   ", "# #  ", "#  # "),
    "l": (" ##  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "),
    "m": ("     ", "     ", "## # ", "# # #", "# # #", "#   #", "#   #"),
    "n": ("     ", "     ", "#### ", "#   #", "#   #", "#   #", "#   #"),
    "o": ("     ", "     ", " ### ", "#   #", "#   #", "#   #", " ### "),
    "p": ("     ", "     ", "#### ", "#   #", "#### ", "#    ", "#    "),
    "q": ("     ", "     ", " ####", "#   #", " ####", "    #", "    #"),
    "r": ("     ", "     ", "# ## ", "##  #", "#    ", "#    ", "#    "),
    "s": ("     ", "     ", " ####", "#    ", " ### ", "    #", "#### "),
    "t": (" #   ", " #   ", "#### ", " #   ", " #   ", " #  #", "  ## "),
    "u": ("     ", "     ", "#   #", "#   #", "#   #", "#   #", " ####"),
    "v": ("     ", "     ", "#   #", "#   #", "#   #", " # # ", "  #  "),
    "w": ("     ", "     ", "#   #", "#   #", "# # #", "# # #", " # # "),
    "x": ("     ", "     ", "#   #", " # # ", "  #  ", " # # ", "#   #"),
    "y": ("     ", "     ", "#   #", "#   #", " ####", "    #", " ### "),
    "z": ("     ", "     ", "#####", "   # ", "  #  ", " #   ", "#####"),
    "{": ("   # ", "  #  ", "  #  ", " #   ", "  #  ", "  #  ", "   # "),
    "|": ("  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "),
    "}": (" #   ", "  #  ", "  #  ", "   # ", "  #  ", "  #  ", " #   "),
    "~": ("     ", "     ", " ##  ", "#  ##", "     ", "     ", "     "),
    "°": (" ##  ", "#  # ", "#  # ", " ##  ", "     ", "     ", "     "),
    "♪": ("  ###", "  # #", "  #  ", "  #  ", " ##  ", "###  ", "###  "),
}


def _compile(rows: tuple[str, ...], w: int, h: int) -> tuple[int, ...]:
    out: list[int] = []
    padded = list(rows)[:h]
    while len(padded) < h:
        padded.append("")
    for r in padded:
        r = (r + " " * w)[:w]
        mask = 0
        for i, px in enumerate(r):
            if px != " ":
                mask |= 1 << (w - 1 - i)
        out.append(mask)
    return tuple(out)


class EmbeddedFont:
    """A bitmap font whose glyphs are per-row bitmasks compiled from ASCII art."""

    def __init__(self, name: str, w: int, h: int, art: dict[str, tuple[str, ...]]):
        self.name = name
        self.w = w
        self.height = h
        self.advance = w + 1
        self.glyphs = {ch: _compile(a, w, h) for ch, a in art.items()}

    def text_width(self, text: str, scale: int) -> int:
        if not text:
            return 0
        return (len(text) * self.advance - 1) * scale

    def draw(self, base: Image.Image, x: int, y: int, text: str, color, scale: int) -> None:
        draw = ImageDraw.Draw(base)
        fallback = self.glyphs.get("?")
        cx = x
        for ch in text:
            glyph = self.glyphs.get(ch, fallback)
            if glyph:
                for ry, row in enumerate(glyph):
                    if not row:
                        continue
                    for rx in range(self.w):
                        if row & (1 << (self.w - 1 - rx)):
                            px, py = cx + rx * scale, y + ry * scale
                            draw.rectangle([px, py, px + scale - 1, py + scale - 1], fill=color)
            cx += self.advance * scale


class FreeTypeFont:
    """A pixel font loaded from a file, rendered 1-bit (no AA) then integer-scaled."""

    def __init__(self, name: str, path: Path, base_size: int):
        self._font = ImageFont.truetype(str(path), base_size)
        self.name = name
        asc, desc = self._font.getmetrics()
        self.height = max(1, asc + desc)

    def text_width(self, text: str, scale: int) -> int:
        if not text:
            return 0
        return int(round(self._font.getlength(text))) * scale

    def draw(self, base: Image.Image, x: int, y: int, text: str, color, scale: int) -> None:
        if not text:
            return
        w = max(1, int(round(self._font.getlength(text))))
        h = self.height
        tmp = Image.new("L", (w + 1, h + 2), 0)
        ImageDraw.Draw(tmp).text((0, 0), text, fill=255, font=self._font)
        # Threshold to kill any antialiasing so upscaling stays crisp.
        mask = tmp.point(lambda v: 255 if v >= 128 else 0)
        if scale > 1:
            mask = mask.resize((mask.width * scale, mask.height * scale), Image.NEAREST)
        solid = Image.new("RGB", mask.size, color)
        base.paste(solid, (x, y), mask)


# ---- font registry ----------------------------------------------------------

# Built-in bitmap fonts (add more EmbeddedFont entries here if you author them).
_BUILTINS: list[EmbeddedFont] = [
    EmbeddedFont("5x7", GLYPH_W, GLYPH_H, _ART),
]
DEFAULT_FONT = "5x7"

_SIZE_RE = re.compile(r"[-_@](\d{1,3})$")


def _base_size_for(path: Path) -> int:
    """Pixel size to load a font file at. Prefer a trailing -N/@N in the name
    (e.g. spleen-8.bdf), else the BDF PIXEL_SIZE/SIZE header, else 8."""
    m = _SIZE_RE.search(path.stem)
    if m:
        return int(m.group(1))
    if path.suffix.lower() in (".bdf", ".pcf"):
        try:
            head = path.read_text(encoding="latin-1", errors="ignore")[:4000]
            ps = re.search(r"PIXEL_SIZE\s+(\d+)", head) or re.search(r"^SIZE\s+(\d+)", head, re.M)
            if ps:
                return int(ps.group(1))
        except OSError:
            pass
    return 8


def _load_file_fonts() -> list[FreeTypeFont]:
    fonts: list[FreeTypeFont] = []
    if not FONTS_DIR.is_dir():
        return fonts
    for path in sorted(FONTS_DIR.iterdir()):
        if path.suffix.lower() not in (".bdf", ".pcf", ".ttf", ".otf"):
            continue
        name = _SIZE_RE.sub("", path.stem)
        try:
            fonts.append(FreeTypeFont(name, path, _base_size_for(path)))
            log.info("loaded scene font '%s' from %s", name, path.name)
        except Exception as exc:  # a bad font file must never break startup
            log.warning("could not load font %s: %s", path.name, exc)
    return fonts


def _build_registry() -> dict[str, object]:
    reg: dict[str, object] = {f.name: f for f in _BUILTINS}
    for f in _load_file_fonts():
        reg.setdefault(f.name, f)
    return reg


FONTS: dict[str, object] = _build_registry()


def get_font(name: str | None):
    return FONTS.get(name or DEFAULT_FONT) or FONTS[DEFAULT_FONT]


def font_list() -> list[dict]:
    """[{name, height}] for the editor — height lets the UI size the box to match
    the actual (integer-scaled) rendered text."""
    out = [{"name": DEFAULT_FONT, "height": FONTS[DEFAULT_FONT].height}]
    for name, f in FONTS.items():
        if name != DEFAULT_FONT:
            out.append({"name": name, "height": f.height})
    return out


# Back-compat alias used by older callers.
GLYPHS = _BUILTINS[0].glyphs
