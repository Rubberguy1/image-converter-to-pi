# Roadmap & future plans

A living list of ideas and planned improvements. Nothing here is committed —
it's a place to capture direction. Contributions welcome; open an issue to
discuss before starting something big.

Status key: 🟢 easy · 🟡 medium · 🔴 large · 💡 idea/needs design

## Display & content

- 🔴 **Custom panel layouts / zones.** Divide the panel into rectangular zones,
  each showing independent content — e.g. on a 64×128, the spinning album disc on
  the top 64×64 and a clock or a second image on the bottom. Design:
  - A *layout* = named zones, each `{x, y, w, h}` in panel pixels + a *source*
    (library image/GIF, music album disc, clock/text, or blank).
  - Replace the single-content player with a **compositor**: each render tick,
    sample every zone's current frame (each source animates on its own timer) and
    paste it at the zone's position into the full panel buffer.
  - Zone sources reuse the existing renderers (`render_to_frames`,
    `render_disc_frames`) targeted at the zone size — the true-circle disc fix
    already makes the album disc drop into any zone cleanly.
  - UI: a layout editor (drag/resize zones on a grid, assign a source to each),
    saved as named layouts you can switch between.
  - Good first step: a fixed "split" layout (2 zones) for the 64×128 case before
    the full drag-and-drop editor.
- 🟡 **Text / clock / weather widgets.** Render scrolling text, a clock, or weather
  to the panel — great as zone sources for the layout feature above.
- 🟡 **Playlists & scheduling.** Queue multiple images/GIFs with per-item durations;
  schedule what shows by time of day (e.g. clock in the morning, art in the evening).
- 🟡 **Transitions & effects.** Crossfade / wipe / slide between items instead of a
  hard cut. Optional per-item effects.
- 🟢 **Per-item playback speed** for GIFs (slow-mo / speed-up).
- 💡 **Video clip support.** Short MP4 → frames pipeline (careful with size/CPU).
- 💡 **Live drawing / pixel-art editor** in the browser, pushed straight to the panel.
- 🔴💡 **Retro "arcade mode" (GBA/SNES/NES at 60fps).** A *separate* program on the
  Pi (not the web app — 60fps can't stream over HTTP): a libretro frontend
  (mGBA/snes9x) that opens the RGBMatrix with the app's saved panel config and
  pushes each emulated frame, with a USB/Bluetooth gamepad. Realities:
  - Native 1:1 needs many panels — SNES/NES 256×240 ≈ 4×4 = 256×256 (16× 64×64,
    16px letterbox); GBA 240×160 ≈ 4×3 with a border. 64×32 panels tile SNES
    256×224 exactly (4×7). This is a big, ~300W+ wall for full native.
  - Needs Pi 4 + Active-3 (parallel chains) and reduced `pwm_bits` (7–8) to hold
    a 100Hz+ refresh while accepting 60fps.
  - Pi 4 emulates these systems at full speed easily; the panel side is the limit.
  - Integrate loosely: the web app could offer a "launch arcade mode" button that
    stops the display service and starts the emulator, sharing panel settings.

## Music sync

- 🟡 **Sync brightness/color to the track** (e.g. dim during quiet passages) via
  Last.fm/Spotify audio features or Plex metadata.
- 🟡 **Spotify provider.** Add Spotify Web API alongside Plex/VLC/Last.fm.
- 🟢 **Configurable spin speed / direction from the UI** (currently `.env` only).
- 💡 **Beat-reactive spin** — vary rotation speed with tempo (needs tempo data).
- 💡 **Progress ring** around the album disc showing track position.

## WLED & home automation

- 🟡 **MQTT transport for WLED sync** — instant, event-driven instead of polling.
- 🟡 **Brightness/color/effect mirroring** with WLED (ambient match), not just on/off.
- 🟡 **Home Assistant integration** — expose the panel as an HA device (MQTT
  discovery or a REST endpoint) so it joins scenes/automations.
- 💡 **Multiple WLED devices / groups.**

## Multi-panel & hardware

- 🔴 **Multi-panel walls.** Support chains + parallel chains with a pixel-mapper for
  physical layouts (see [SCALING_PLAN.md](SCALING_PLAN.md)). The config already
  exposes `chain_length`, `parallel`, width/height, and panel type.
- 🟡 **UI for panel geometry** — set width/height/chain/parallel from the web app
  instead of `.env`.
- 💡 **Auto power-saving** — dim or sleep on a schedule / ambient light sensor.

## App & platform

- 🟡 **Persist and restore last-shown content** across restarts.
- 🟡 **Multiple named scenes/presets** you can switch between quickly.
- 🟢 **Auth / access control** for the web UI (optional PIN) for shared networks.
- 🟢 **Health/metrics endpoint** (refresh rate, CPU temp, current draw estimate).
- 🟡 **Dockerize the emulator dev environment** for one-command local setup.
- 🟢 **Tests & CI** — unit tests for the imaging pipeline and sync coordinators,
  GitHub Actions to run them.

## Done ✅

- Image/GIF upload, crop, live preview
- Fit modes: cover / contain / native (1:1) / integer-zoom / stretch
- Animated-GIF preview and playback
- Color-depth (PWM bit-depth) simulation in the preview
- Music album-art sync (Plex / VLC / Last.fm) with spinning-CD effect
- True-circle spinning disc (correct on non-square panels)
- Panel-based geometry (panels wide/tall), orientation, and power/PSU estimate
- Settings menu (panel layout + color/flicker tuning + credentials + WLED), live apply
- Live panel mirror in the music panel
- WLED power sync (panel ↔ lights, HTTP)
- Screen mirror (browser screen capture → WebSocket → panel, live)
- Custom scenes: background + placeable clock / text / weather / value widgets,
  composited persistently on the Pi (visual grid editor)
- Emulator-based dev workflow + `npm run dev` orchestrator + `update.sh`
- FM6126A / panel-type + GPIO / PWM-LSB / refresh tuning (incl. flicker recipe)
- systemd service + one-shot Pi installer
