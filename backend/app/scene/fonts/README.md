# Scene widget fonts

Drop pixel/bitmap font files here and they're picked up automatically at
startup — each becomes a selectable font for text widgets in the scene editor.

## Supported files

- `.bdf` / `.pcf` — X11-style bitmap fonts (recommended; truly crisp, 1-bit).
- `.ttf` / `.otf` — pixel-designed fonts (e.g. "Press Start 2P"). Rendered
  1-bit at their native pixel size, so they stay crisp; non-pixel fonts will
  look rough and aren't recommended.

## Naming / size

Bitmap fonts have a fixed native pixel size. It's detected from:

1. a trailing number in the filename — `spleen-8.bdf`, `cozette@13.bdf`, or
2. the BDF `PIXEL_SIZE` / `SIZE` header, or
3. a fallback of 8.

The font's display name is the filename with that `-N`/`@N` suffix stripped
(`spleen-8.bdf` → **spleen**). The widget then integer-scales it (1×, 2×, 3×…),
so the on-panel height is `native_size × scale`.

## Where to find good ones (public domain / permissive)

- hzeller/rpi-rgb-led-matrix `fonts/` — `4x6.bdf`, `5x7.bdf`, `6x10.bdf`,
  `tom-thumb.bdf`, `clR6x12.bdf`, etc. (X11 misc, public domain).
- spleen (BSD), Cozette (MIT), Tamzen (MIT).

Just copy the file into this folder and restart the backend.

## Built-in font

`5x7` is embedded in `../pixelfont.py` (no file needed) and is the default.
