# Sprites: the panel's virtual assistant

A **sprite** is a pixel-art character that lives in a scene and reacts to what
the panel knows about: it idles, dances while music plays, announces a new
track, "talks" a notification in a speech bubble, and says whatever an external
service asks it to. Sprites are authored in the **Sprite Studio** (its own
section of the app) from an existing sprite sheet, then placed in scenes from
the scene editor's **Sprites** tab.

```
                     Sprite Studio                                   Scene editor
 sheet (PNG) ──▶ regions (crops, repeated) ──▶ frames 0..n
                 animations = ordered frames + fps + loop            sprite widget:
                 triggers   = event → animation (priority list)  ──▶   sprite_id, scale, flip,
                 anchor, transparency                                   speech bubble options
                                                                         │
                                                       scene runner picks the animation each tick
```

## Concepts

| Term | Meaning |
|------|---------|
| **Sheet** | An uploaded image. A sprite can hold **several sheets** (e.g. a walk sheet and an attack sheet); each is sliced on its own, and frames from every sheet share one numbering so an animation can mix them. Add sheets from the Sheets list in the Studio (`POST /api/sprites/{id}/sheets`); removing one drops its regions and re-points clips. |
| **Region** | A crop rectangle on one sheet (`sheet, x, y, w, h`), optionally **repeated** `cols × rows` with gaps to yield many frames of that size. A sheet can have several regions (e.g. a 16×16 walk row and a 32×32 attack row). |
| **Frame** | One cell, numbered in region order, row-major within a region. Frames can differ in size across regions. |
| **Animation (clip)** | A named, ordered list of frame indices + `fps` + `loop`. Repeat a frame to hold it. Names are `[A-Za-z0-9_-]`. Presets: `idle`, `talk`, `dance`, `wave`, `sleep`, `happy`, `sad`. |
| **Trigger** | A rule `event → animation`. The sprite's triggers are an ordered priority list; the first event that is happening wins, otherwise `idle_clip` plays. |
| **Anchor** | Where a smaller frame sits inside the widget box (the largest frame): `bottom-center` keeps feet planted, `top-left` pins the corner, etc. |
| **Transparency** | `auto` (use alpha if the PNG has it, else key the top-left pixel colour), `none`, or a hex colour to key. |
| **Say** | An explicit line: `POST /api/sprite/say` shows a bubble + the say/talk animation for N seconds. |

## Trigger events

| Event | Fires when | Params | Bubble text |
|---|---|---|---|
| `say` | `/api/sprite/say` was called (for its duration) | — | the text |
| `notification` | a notification is showing (from the notification queue) | — | `title\nmessage` |
| `track` | within N seconds of a new track starting, while playing | `seconds` (6) | `♪ title\nartist` |
| `music` | anything is playing | — | — |
| `value` | a pushed value compares true (`/api/scene/value`; the web app pushes `battery`) | `name`, `op` (`< <= > >= == !=`), `value` | — |
| `time` | the local time is inside a window (wraps past midnight) | `from`, `to` (`HH:MM`) | — |

An explicit *say* is always honoured even if no `say` trigger is listed. A
trigger with no animation falls through sensibly (`track` → the music
animation, `say` → the notification animation) or keeps idling.

## The Studio

- **Left:** sprite list + upload; sheet settings (name, transparency, anchor);
  the selected region's crop / repeat / gap fields with *Fill row* / *Fill down*.
- **Center:** the sheet, zoomable (wheel) and pannable (middle-drag or
  Space+drag). Two tools: **Regions** (drag on empty sheet to crop; drag a
  region to move it; corner handles resize the cell size; arrows nudge; Delete
  removes) and **Frames** (click frames in play order to append them to the
  selected animation). Below the sheet, a strip of every frame — click to add.
- **Right:** **Animations** (player with scrub, fps, loop; a timeline where
  frames can be reordered/removed; reverse, ping-pong, all-frames helpers) and
  **Triggers** (idle fallback + the ordered rule list).
- **Save** (Ctrl+S) writes the sprite; **Revert** discards. `R`/`F` switch tools.

## Where things live

Backend (`backend/app/`):
- `sprites/model.py` — `Sprite`, `Region`, `Clip`, `Trigger`, `SpriteStore` (index at `data/sprites.json`, sheets under `data/sprites/<id>/sheet.<ext>`), `guess_grid()` for a fresh upload's first region. Legacy uniform-grid sprites migrate to one repeated region on load.
- `sprites/render.py` — `SpriteRenderer` (slices + integer-scales frames, cached by `(sprite, version, scale, flip)`), `load_sheet()` (transparency rule), `anchor_offset()`, `draw_bubble()` (pixel speech bubble with tail, wrap, and paging).
- `scene/runner.py` — `_draw_sprite()` (frame selection by wall clock; a new animation restarts at frame 0; anchored placement in the widget box), `_sprite_intent()` (walks the trigger list), `_update_signals()` (track-change detection + banner suppression), `say()`.
- `notifications.py` — `current()` + `set_banner_suppressed()`: while a visible sprite presents notifications the banner overlay is skipped; queue/timing still run there.
- `api/routes.py` — `/api/sprites*` and `/api/sprite/say`.

Frontend (`frontend/src/`):
- `components/studio/SpriteStudio.jsx` — the section (desktop three-pane; mobile stacked under the **Sprites** tab).
- `components/studio/SheetCanvas.jsx` — the zoom/pan canvas with region editing and frame picking.
- `components/studio/AnimationsPanel.jsx`, `TriggersPanel.jsx`, `FrameThumb.jsx`, `spriteGeom.js` (geometry shared with the backend's model).
- `components/SpritesPanel.jsx` — the scene editor's picker (place / open in Studio).
- `components/SceneControls.jsx` — the sprite widget's config: sheet, scale, flip, speech bubble, a read-only trigger summary with *Edit in Sprite Studio*, and a "Say it" tester.
- `components/SceneCanvas.jsx` — corner-resize snaps sprites to whole scales of the box; context menu gets Flip / Speech bubble.

## Widget config (saved in the scene)

```json
{
  "id": "…", "type": "sprite", "x": 2, "y": 30,
  "config": {
    "sprite_id": "8a89446e35f6",
    "scale": 2, "w": 32, "h": 32,        // w/h = sprite box × scale (kept in sync by the UI)
    "flip": false,
    "bubble": {
      "enabled": true,
      "notifications": true,             // present notifications in the bubble (hides the banner)
      "track": true, "track_seconds": 6,
      "side": "auto",                    // auto | left | right | above | below | custom
      "box": { "dx": 19, "dy": -6, "w": 40, "h": 20 }, // custom: relative to the sprite's top-left
      "style": "light",                  // light (white) | dark (black, white border)
      "cps": 18, "hold": 1.5,            // typewriter chars/second; seconds the finished bubble lingers
      "radius": 2,                       // corner rounding in px (0 = square)
      "tail": "auto", "tail_at": null,   // tail edge: auto | left | right | top | bottom | none; 0..1 along it (null = aim at sprite)
      "sample": "Hi!"                    // shown only in the editor preview
    }
  }
}
```

Presence (per widget, `config.presence`): `mode` `always` keeps the sprite on
the panel; `on_events` makes it leave after `idle_seconds` with no event, in
`direction` (left/right/up/down) over `exit_seconds` playing `exit_clip`, and
come back the same way over `enter_seconds` playing `enter_clip` when one of
`wake_on` (say, notification, track, music, value, time) happens. A bubble that
arrives while it is off-screen waits until it is fully in, then types.

```json
"presence": { "mode": "on_events", "idle_seconds": 10, "direction": "left",
              "exit_clip": "walk", "enter_clip": "walk", "exit_seconds": 1, "enter_seconds": 1,
              "wake_on": ["say", "notification", "track"] }
```

Which animation plays is decided by the **sprite's** triggers, so every scene
that places it behaves the same. Bubble options (announce tracks, present
notifications) only control whether *text* is shown; the event's animation
fires regardless. The backend logs `track change detected: …` and
`sprite <id>: idle -> wave (track)` at INFO, so `journalctl -u pixel-pusher -f`
(or the dev terminal) shows exactly what fired. Unknown or removed sprites render a small "?"
placeholder so the layout still previews.

## Sprite JSON (as the API returns it)

```json
{
  "id": "…", "name": "Buddy", "sheet_w": 64, "sheet_h": 32,
  "regions": [{ "id": "a1", "name": "frames", "x": 0, "y": 0, "w": 16, "h": 16, "cols": 4, "rows": 2, "gap_x": 0, "gap_y": 0 }],
  "clips": { "idle": { "frames": [0, 0, 0, 1], "fps": 4, "loop": true }, "talk": { "frames": [4, 5], "fps": 8, "loop": true } },
  "triggers": [
    { "id": "t1", "event": "say", "clip": "talk", "params": {} },
    { "id": "t2", "event": "notification", "clip": "talk", "params": {} },
    { "id": "t3", "event": "track", "clip": "", "params": { "seconds": 6 } },
    { "id": "t4", "event": "music", "clip": "dance", "params": {} }
  ],
  "idle_clip": "idle", "anchor": "bottom-center", "transparent": "auto",
  "frames": [{ "x": 0, "y": 0, "w": 16, "h": 16 }, …], "frame_count": 8, "box": { "w": 16, "h": 16 },
  "version": 3, "sheet_url": "/api/sprites/…/sheet?v=3", "thumb_url": "/api/sprites/…/thumb?v=3"
}
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/sprites` | `{sprites, presets, events, anchors}` |
| POST | `/api/sprites` (multipart `file`, optional `name`) | Upload a sheet; a first region is guessed; `idle` = all frames |
| GET / PUT / DELETE | `/api/sprites/{id}` | Read / edit (`name, transparent, anchor, idle_clip, regions, clips, triggers`) / delete |
| GET | `/api/sprites/{id}/sheets/{sheet_id}?v=` | One sheet's image (cacheable; `v` = version). `/sheet` = the first sheet |
| POST / DELETE | `/api/sprites/{id}/sheets[/{sheet_id}]` | Add a sheet (multipart `file`, optional `name`) / remove one (never the last) |
| GET | `/api/sprites/{id}/thumb?v=` | First idle frame, scaled ~96px |
| GET | `/api/sprites/{id}/preview?clip=&scale=` | An animation as an animated GIF in the widget box |
| POST | `/api/sprite/say` `{text, clip?, duration?, widget_id?}` | Make the sprite(s) speak on the live panel |

```bash
curl -X POST http://raspberrypi.local:8000/api/sprite/say \
  -H 'Content-Type: application/json' \
  -d '{"text":"Build passed!","clip":"happy","duration":6}'
```

## How the runner decides what to play (each tick)

1. Walk the sprite's triggers top to bottom; the first whose event is happening
   wins (see the table above). An active *say* wins even without a say trigger.
2. Otherwise the idle animation.
3. Switching animation restarts it at frame 0. Frame index =
   `floor(elapsed × fps) mod n` for looping clips; non-looping clips hold their
   last frame. The compositor's adaptive tick picks up `1000 / fps`.
4. Bubbles are **typewritten** at `cps` characters per second; the talking
   animation plays only while characters are still arriving, then the sprite
   returns to music/idle while the finished bubble lingers for `hold` seconds.
   Text fills the bubble line by line and **crawls**: once the box is full the
   oldest line scrolls off the top (dialog-box style). Auto bubbles cap at
   ~60 % of the panel height; a `custom` box (dragged on the scene canvas,
   stored relative to the sprite) uses exactly its own width and height. `side: auto` uses the column beside the sprite when
   it's at least ~55 % of the panel wide, otherwise the taller of above/below.

## Making a sheet

- Any size; PNG with alpha is ideal. Sheets without alpha work via
  colour-keying (auto = top-left pixel).
- Keep frames small: a 64×64 panel with a 16×16 sprite at ×2 leaves room for a
  bubble. Whole-number scales only (×1…×16) so pixels stay crisp.
- On upload one region is guessed (strip of squares → square frames; otherwise
  the largest common tile size). A `64×32` sheet is ambiguous (2×32 or 8×16),
  so check the region in the Studio.

## Roadmap / ideas

- Aseprite JSON import (frame tags → animations, per-frame durations).
- Per-frame durations and per-animation flip.
- More events: game-server online/offline, weather, WLED state.
- Random idle variations (blink, look around) with weighted picks.
- Sprite-to-sprite conversations when a scene has two characters.
