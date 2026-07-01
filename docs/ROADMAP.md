# Roadmap & future plans

A living list of ideas and planned improvements. Nothing here is committed —
it's a place to capture direction. Contributions welcome; open an issue to
discuss before starting something big.

Status key: 🟢 easy · 🟡 medium · 🔴 large · 💡 idea/needs design

## Display & content

- 🟡 **True-circle spinning disc on non-square panels.** The disc mask currently
  fills the whole frame, so on a non-square wall (e.g. 128×64) it becomes an oval.
  Fix: center a circle of diameter `min(width, height)`.
- 🟡 **Text / clock / weather widgets.** Render scrolling text, a clock, or weather
  to the panel — either full-screen or composited with images.
- 🟡 **Playlists & scheduling.** Queue multiple images/GIFs with per-item durations;
  schedule what shows by time of day (e.g. clock in the morning, art in the evening).
- 🟡 **Transitions & effects.** Crossfade / wipe / slide between items instead of a
  hard cut. Optional per-item effects.
- 🟢 **Per-item playback speed** for GIFs (slow-mo / speed-up).
- 💡 **Video clip support.** Short MP4 → frames pipeline (careful with size/CPU).
- 💡 **Live drawing / pixel-art editor** in the browser, pushed straight to the panel.

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

- Image/GIF upload, crop, auto-fit, live preview
- Animated-GIF preview and playback
- Music album-art sync (Plex / VLC / Last.fm) with spinning-CD effect
- Live panel mirror in the music panel
- WLED power sync (panel ↔ lights, HTTP)
- Emulator-based development workflow
- FM6126A / panel-type + GPIO tuning options
- systemd service + one-shot Pi installer
