# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — the operator/owner:** the maker who built and runs the panel. A
hobbyist comfortable with a Raspberry Pi, HUB75 LED matrices, and a home LAN.
Uses Pixel Pusher as a daily driver from **both** desktop (building scenes) and
phone (quick tweaks) — both are first-class.

**Secondary — other makers:** the project is public on GitHub for others to clone
and self-host. It must be self-explanatory enough that a stranger can set it up
and understand it without reading the code — clear empty states, first-run
guidance, and sensible defaults — while staying efficient for the owner.

## Product Purpose

A self-hosted web app for controlling a HUB75 RGB LED matrix (a single 64×64
module up to multi-panel walls) driven by a Raspberry Pi. It lets the operator
upload/crop/fit images and GIFs, **compose persistent "scenes"** of widgets,
sync album art from their music, mirror their screen to the panel, and
monitor/notify on connected services (game servers, WLED). Success is a living
panel that shows exactly what was configured — reconfigurable in seconds from any
device on the network. **The scene composer is the heart of the product.**

## Positioning

A fully **local, no-cloud, no-account** controller where one device hosts
everything (the Pi runs the backend *and* serves the UI), and the same code runs
against real hardware or a browser emulator. Mechanisms a neighboring product
couldn't trivially copy:

1. **"Everything is a scene"** — a persistent widget compositor that runs
   headless on the Pi (clock/weather/music/notifications keep ticking with no
   browser open), not a one-shot image pusher.
2. **Credential-free, per-user, browser-local connection model** — each user
   configures their own Pi connection; the app never connects to anything the
   user didn't explicitly choose. Credentials live in the browser.
3. **Split-deployment** — backend on the Pi, UI anywhere (Docker on a NAS, or
   hosted), with a deployment-aware self-updater.
4. **Open push-based integration surface** — any external source (a browser
   extension, a Discord bot, a game-server monitor) can POST now-playing or
   notifications.

## Operating Context

- The operator opens the UI from a PC or phone on the same LAN (or over
  Tailscale/Cloudflare when hosted). **Desktop** drives the drag/drop/resize
  scene editor; **phone** is for quick tweaks (push an image, brightness, toggle
  sync).
- The **panel itself is the real output** — a physically-mounted LED wall viewed
  across a room. Glanceability governs what content works: short text, big
  numbers, icons, album art at a distance.
- Runs 24/7 as a **systemd service** on the Pi; scenes tick with no browser open.
- Deployment modes: all-on-Pi, or **backend-only Pi + frontend elsewhere**.
  HTTPS is optional (required for the Firefox browser extension and screen
  mirror).
- A companion **browser extension** feeds now-playing from any tab; external
  services feed notifications and game-server status.

## Capabilities and Constraints

**Capabilities:** image/GIF upload with interactive crop and fit modes
(Cover / Contain / Native 1:1 / Integer-zoom / Stretch); live in-browser panel
preview including a color-depth / PWM-banding simulation; the **scene composer**
(widgets: image/GIF, clock, text, weather [keyless], pushed-value, music
album-art, now-playing, notifications — each with position, size, layer/z-index,
rotation; pixel fonts with independent text sizing; multi-panel layout with
per-panel map/rotate and an identify mode); music album-art sync with a
spinning-CD effect (Plex, VLC, Last.fm, and a push "Browser" provider via the
extension); WLED power sync; screen mirror (WebSocket, needs a secure context);
**notifications** (transient pop-up overlays from any service, with a queue,
expiry, and per-source muting); a **Steam/Source game-server monitor** (A2S) that
raises notifications; in-app settings (panel geometry, orientation, color depth,
flicker/refresh tuning, brightness, provider credentials); a wattage/PSU
estimate; and a web-UI self-update.

**Constraints:** the physical output is a **low-resolution LED matrix** (per-panel
64×64; walls scale by panels-wide × panels-tall) — the *panel content* is tiny,
low-color, and viewed at distance, while the *web UI* is a normal-resolution app.
Runs on a **Raspberry Pi** (limited CPU — heavy renders must stay off the event
loop). **Local-first:** no cloud, no accounts, no telemetry; credentials live
per-browser. Terminology: **panel** = one physical 64×64 module; **wall** = the
logical grid of panels; **scene** = a saved widget composition; **content size**
(layout) vs **physical size** (wiring).

## Brand Commitments

- **Name:** Pixel Pusher. Public open-source project on GitHub.
- **Voice** (from the README and docs): plain, technical, friendly-maker —
  direct and concrete, explains the *why*, and is honest about limitations and
  tradeoffs. No marketing fluff.
- **Privacy is binding:** no cloud, no accounts, no telemetry; the app only ever
  contacts what the user explicitly configured. The author's anonymity and the
  absence of committed secrets must be preserved.

## Evidence on Hand

- A real, working product: README with architecture diagram + feature list;
  `docs/` (DEPLOYMENT, DEVELOPMENT, HARDWARE, HTTPS, PI_SETUP, ROADMAP,
  SCALING_PLAN); CONTRIBUTING.
- Live UI in `frontend/src`: `App.jsx`, the scene editor
  (`SceneCanvas`/`SceneControls`/`SceneSidebar`), `SettingsModal` (Panel, Music,
  WLED, Notifications, Game servers, Updates tabs), `MusicPanel`,
  `NotificationsPanel`, `GameServersPanel`, `UpdatesPanel`, `ConnectScreen`,
  `PerfBadge`, `ScreenMirror`, `Gallery`.
- No fabricated users, testimonials, benchmarks, or pricing — a personal/maker
  open-source tool. Future work must not invent adoption or commercial claims.

## Product Principles

1. **Local-first and private by default** — no cloud, no accounts; touch only
   what the user chose.
2. **Everything is a scene** — a persistent, headless widget compositor is the
   core model, not an afterthought.
3. **Glanceability is the point** — the panel is read across a room; features
   serve at-a-distance legibility on a tiny, low-color display.
4. **One device hosts everything, but deployment is flexible** — self-hosted,
   split-able, self-updating; identical on hardware or emulator.
5. **Approachable to a stranger, efficient for the owner** — sensible defaults
   and clear states for first-time makers; dense, fast control for the daily
   driver.

## Accessibility & Inclusion

No formal standard is established. Product-specific needs (inferred from the usage
context, not user-stated): the web UI is used on **both desktop and phone**, so
layouts must be responsive and controls thumb-friendly; the app is often used in
**dark rooms** (dark UI); and status must not rely on **color alone** (pair
status dots with labels/text).
