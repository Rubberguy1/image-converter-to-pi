# Pixel Pusher — 64×64 LED Matrix Controller

Control a HUB75 RGB LED matrix from a web app on your network. Upload any image or
GIF, crop and auto-fit it to the panel, and push it to the display from a React UI.
Optionally sync to your music player to show spinning album artwork, or mirror the
on/off state of your WLED lights.

```
┌─────────────┐        Wi-Fi/LAN        ┌──────────────────────────────┐
│  Browser    │  ───────────────────▶   │  Raspberry Pi                │
│  React app  │   http://pi.local:8000  │  ├─ FastAPI backend          │
│  (any PC/   │                         │  ├─ Image/GIF pipeline (PIL) │
│   phone)    │  ◀───── status/preview  │  ├─ Matrix driver            │
└─────────────┘                         │  │   • rgbmatrix (hardware)  │
                                        │  │   • emulator (dev)        │
                                        │  ├─ Playback loop            │
                                        │  ├─ Music now-playing poller │
                                        │  └─ WLED power sync          │
                                        └──────────────┬───────────────┘
                                                       │ HUB75
                                                ┌──────▼───────┐
                                                │ 64×64 panel  │
                                                └──────────────┘
```

## Features

- **Upload any image or GIF**, crop interactively, and auto-fit to the panel.
- **Live panel preview** in the browser — see exactly what the matrix shows,
  including animated GIFs.
- **Music album-art sync** with a spinning-CD effect. Providers for **Plex**,
  **VLC**, and **Last.fm** (universal — works with YouTube Music and anything that
  scrobbles).
- **WLED power sync** — blank/wake the panel with your WLED lights (or vice versa).
- **Develop without hardware** — a built-in emulator renders the panel in your
  browser, so you can build and test on any OS.
- **Runs headless on the Pi** as a systemd service and serves its own web UI.

## Why this design

- **One device hosts everything.** The Pi runs the backend *and* serves the built
  React app, so you just open `http://raspberrypi.local:8000` from any machine.
- **Develop anywhere without the hardware.** The matrix driver is abstracted with
  two backends: the real [`rpi-rgb-led-matrix`](https://github.com/hzeller/rpi-rgb-led-matrix)
  on the Pi, and [`RGBMatrixEmulator`](https://github.com/ty-porter/RGBMatrixEmulator)
  for local dev. Same code path.

## Choosing a Raspberry Pi

| Pi | Verdict |
|----|---------|
| **Pi 4 (2–4GB)** | **Recommended.** Best-supported, plenty of headroom, and required if you ever chain multiple panels. |
| Pi 3 B / B+ | Great for a single 64×64 panel. |
| Pi Zero 2 W | Works for one panel; less headroom for high-FPS GIFs. |
| Pi 5 | ⚠️ Not recommended — its RP1 GPIO is poorly supported by the matrix library. |

You'll also want an **Adafruit RGB Matrix HAT/Bonnet** and an adequately-sized 5V
supply. See [docs/HARDWARE.md](docs/HARDWARE.md) for the full parts list and wiring.

## Quick start (local dev — no Pi needed, uses the emulator)

One-time setup of the backend virtualenv:

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate          # Windows; use source .venv/bin/activate elsewhere
pip install -r requirements.txt
cd ..
```

Then start **both** the backend (emulator mode) and the frontend with one command
from the repo root:

```bash
npm run dev
```

That launches the API on `http://localhost:8000` and the Vite dev server, and the
emulator renders a virtual panel in your browser (default `http://localhost:8888`).
It auto-installs the frontend's npm deps on first run.

<details>
<summary>Prefer to run them separately?</summary>

```bash
# Backend (terminal 1)
cd backend
. .venv/Scripts/activate           # or source .venv/bin/activate
export MATRIX_BACKEND=emulator      # Windows: set MATRIX_BACKEND=emulator
uvicorn app.main:app --reload --port 8000

# Frontend (terminal 2)
cd frontend && npm install && npm run dev
```

Or run just one side: `npm run dev:backend` / `npm run dev:frontend`.
</details>

## Deploy to a Raspberry Pi

Clone the repo on the Pi and run the installer:

```bash
git clone <your-fork-url> pixel-pusher
cd pixel-pusher
bash deploy/install-pi.sh
```

It builds the matrix library, sets up Python, builds the web app, and installs a
systemd service that auto-starts on boot. Then open `http://raspberrypi.local:8000`.

For the manual walkthrough (and hardware/wiring), see
[docs/PI_SETUP.md](docs/PI_SETUP.md) and [docs/HARDWARE.md](docs/HARDWARE.md).

## Configuration

Copy `backend/.env.example` to `backend/.env` and edit as needed (matrix backend,
panel tuning, music providers, WLED). All values are optional with sensible
defaults. **Never commit your `.env`** — it's gitignored.

## Documentation

- [docs/HARDWARE.md](docs/HARDWARE.md) — parts list, wiring, power, scaling to multiple panels
- [docs/PI_SETUP.md](docs/PI_SETUP.md) — full Raspberry Pi setup
- [docs/SCALING_PLAN.md](docs/SCALING_PLAN.md) — planning a multi-panel wall
- [docs/ROADMAP.md](docs/ROADMAP.md) — planned improvements & ideas
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute

## Repo layout

```
backend/    FastAPI app, matrix drivers, imaging, playback, music + WLED integrations
frontend/   React + Vite web UI (upload, crop, gallery, controls, music, WLED)
deploy/     systemd unit + install script for the Pi
docs/       hardware/wiring, Pi setup, scaling, roadmap
```

## License

MIT — see [LICENSE](LICENSE).
