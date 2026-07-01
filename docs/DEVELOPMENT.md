# Development & testing workflow

You edit on your PC, push to GitHub, and the Pi runs a clone that drives the real
panels. Here's how to iterate quickly and verify changes on the actual hardware.

The Pi's clone won't update itself — changes must be **pulled and applied**. Pick
the tier that matches what you're changing.

## Tier 1 — Deploy & test (reliable, any change)

On the Pi, one command pulls the latest, updates deps, rebuilds the web UI, and
restarts the service:

```bash
cd ~/pixel-pusher
bash deploy/update.sh
journalctl -u pixel-pusher -f     # watch logs
```

Use this after you've pushed and want the running service to reflect it. Frontend
rebuilds take a minute or two on a Pi 3; backend-only changes apply instantly.

## Tier 2 — Fast backend/hardware iteration (auto-reload on the Pi)

For changes that need the real panels (rendering, orientation, disc, music), run
the backend in **reload mode** so it restarts on file changes — then each
`git pull` is picked up automatically, no manual restart.

```bash
# stop the service so it doesn't hold port 8000
sudo systemctl stop pixel-pusher

# run the backend in the foreground with --reload (root for GPIO)
cd ~/pixel-pusher/backend
sudo .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --loop asyncio --reload
```

Now in a second SSH session, `git pull` whenever you push — uvicorn reloads and
the panel updates. When you're done:

```bash
# Ctrl-C the dev server, then bring the service back
sudo systemctl start pixel-pusher
```

> Only one process can bind port 8000 — always stop the service before running the
> dev server, and restart the service when finished.

## Tier 3 — Fast frontend iteration (PC dev server → real Pi backend)

UI changes don't need to touch the Pi at all. Run the Vite dev server **on your
PC** but point its API proxy at the Pi, so you get instant hot-reload in your
browser while the previews, live mirror, and controls hit the **real panels**.

```bash
cd frontend
# macOS/Linux:
VITE_API_TARGET=http://raspberrypi.local:8000 npm run dev
# Windows PowerShell:
$env:VITE_API_TARGET="http://raspberrypi.local:8000"; npm run dev
```

Open the Vite URL it prints. Edit React files → they hot-reload against live Pi
data. When happy, deploy the built UI to the Pi with Tier 1.

## Bonus — edit directly on the Pi (VS Code Remote-SSH)

Install the **Remote - SSH** extension in VS Code, connect to
`raspberrypi.local`, and open `~/pixel-pusher`. You can now edit files on the Pi
as if they were local, with the Tier 2 `--reload` server running for instant
feedback on the panels. Commit/push from the Pi to send changes back to GitHub.

## Which tier when?

| You're changing… | Use |
|------------------|-----|
| Anything, final verification | Tier 1 (`update.sh`) |
| Matrix/rendering/music (needs panels) | Tier 2 (`--reload` on Pi) |
| Web UI look/behavior | Tier 3 (Vite on PC → Pi) |

## Notes

- The frontend is served by the backend from `frontend/dist/`, which is
  gitignored — so after pulling frontend changes the Pi must rebuild it
  (`update.sh` does this). Alternatively build on your PC and `scp` `dist/` over.
- `backend/data/` (uploaded media, saved settings) stays on the Pi and is never
  overwritten by a pull.
