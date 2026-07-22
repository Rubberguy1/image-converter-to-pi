"""Logical-wall ↔ physical-panel remapping for multi-panel walls.

The app renders content to a LOGICAL wall (`grid_cols × grid_rows` panels, drawn
upright). The physical panels are daisy-chained and/or split across the HAT's
parallel outputs, and each can be mounted in any position and rotation. This
module rearranges the logical wall into the flat framebuffer the matrix library
drives, according to a user-configured panel map — and draws the "identify"
pattern that numbers each physical panel so the map can be built.

Panel map: one entry per LOGICAL grid cell (row-major), `{physical, rot}` —
  physical: which physical panel (0..N-1) is mounted at that cell, numbered as
            the library lays them out: slot = parallel_index * chain_length + chain_index
  rot:      degrees the content is rotated (CCW) to compensate for how the panel
            is mounted (0/90/180/270). 90/270 assume square panels.
"""
from __future__ import annotations

from PIL import Image, ImageDraw

from ..scene.pixelfont import get_font

_ROTS = (0, 90, 180, 270)


def normalize_map(raw, n: int) -> list[dict]:
    """Coerce a stored panel map to exactly n valid {physical, rot} entries."""
    raw = raw or []
    out: list[dict] = []
    for i in range(n):
        e = raw[i] if i < len(raw) and isinstance(raw[i], dict) else {}
        phys = e.get("physical", i)
        rot = e.get("rot", 0)
        try:
            phys = int(phys)
            rot = int(rot) % 360
        except (TypeError, ValueError):
            phys, rot = i, 0
        if not (0 <= phys < n):
            phys = i
        if rot not in _ROTS:
            rot = 0
        out.append({"physical": phys, "rot": rot})
    return out


def remap(logical: Image.Image, pw: int, ph: int, grid_cols: int, grid_rows: int,
          chain: int, parallel: int, panel_map) -> Image.Image:
    """Rearrange the logical wall into the physical framebuffer the library drives."""
    n = grid_cols * grid_rows
    phys = Image.new("RGB", (chain * pw, parallel * ph), (0, 0, 0))
    pm = normalize_map(panel_map, n)
    for k in range(n):
        gx, gy = k % grid_cols, k // grid_cols
        cell = logical.crop((gx * pw, gy * ph, gx * pw + pw, gy * ph + ph))
        rot = pm[k]["rot"]
        if rot:
            cell = cell.rotate(rot, expand=True)
        slot = pm[k]["physical"]
        c, p = slot % chain, slot // chain
        # Centre if a 90/270 rotation of a non-square panel changed the size.
        ox = c * pw + (pw - cell.width) // 2
        oy = p * ph + (ph - cell.height) // 2
        phys.paste(cell, (ox, oy))
    return phys


def identify_frame(pw: int, ph: int, chain: int, parallel: int) -> Image.Image:
    """A physical framebuffer that shows each panel's number, a border, and a
    bright bar along its top edge (so you can see if a panel is mounted rotated)."""
    phys = Image.new("RGB", (chain * pw, parallel * ph), (0, 0, 0))
    d = ImageDraw.Draw(phys)
    font = get_font(None)
    scale = max(1, min(pw, ph) // 12)
    for p in range(parallel):
        for c in range(chain):
            slot = p * chain + c
            x0, y0 = c * pw, p * ph
            d.rectangle([x0, y0, x0 + pw - 1, y0 + ph - 1], outline=(40, 60, 120))
            d.rectangle([x0 + 2, y0 + 2, x0 + pw - 3, y0 + 3], fill=(0, 170, 255))  # "up" bar
            s = str(slot)
            tw = font.text_width(s, scale)
            font.draw(phys, x0 + (pw - tw) // 2, y0 + (ph - font.height * scale) // 2,
                      s, (255, 255, 255), scale)
    return phys
