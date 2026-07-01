# Raspberry Pi setup

End-to-end install on a Raspberry Pi: OS, the matrix library, this app, and an
auto-start service. You can also use the helper script `deploy/install-pi.sh`
which automates most of steps 3–6.

> Works on any 40-pin Pi. **Pi 4 recommended**; Pi 3 B/B+ and Zero 2 W are fine
> for a single panel. Avoid the Pi 5 (RP1 GPIO is poorly supported by the matrix
> library). Commands below use `<user>` for your Linux username — substitute your
> own (the default is often `pi`).

## 1. Flash Raspberry Pi OS

Use Raspberry Pi Imager → **Raspberry Pi OS Lite (64-bit)** (no desktop needed).
In the Imager's settings (gear icon) set:
- hostname: `raspberrypi` (you'll reach the app at `http://raspberrypi.local:8000`)
- enable **SSH**, set a username/password
- configure your **Wi-Fi** (same network as the machine you'll browse from)

Boot the Pi, then from your PC:

```bash
ssh <user>@raspberrypi.local
```

## 2. System packages

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git python3-venv python3-dev python3-pillow \
    build-essential libgraphicsmagick++-dev libwebp-dev cython3
```

## 3. Build the matrix driver (`rpi-rgb-led-matrix`)

This compiles hzeller's library and its Python bindings, which provide the
`rgbmatrix` module the app prefers on hardware.

```bash
cd ~
git clone https://github.com/hzeller/rpi-rgb-led-matrix.git

# Install with pip from the REPO ROOT (pyproject.toml lives at the root, NOT in
# bindings/python). The build compiles the C++ library + Cython bindings for you.
sudo apt install -y python3-dev python3-pip cython3
cd rpi-rgb-led-matrix
sudo python3 -m pip install . --break-system-packages
```

> Notes / gotchas (each of these produces a distinct error if you get it wrong):
> - Run `pip install .` from the **repo root** (`~/rpi-rgb-led-matrix`), not
>   `bindings/python` — the latter has no build file and gives
>   `Directory '.' is not installable. Neither 'setup.py' nor 'pyproject.toml' found`.
> - Old guides say `make build-python` — that target doesn't exist; you'd get
>   `No rule to make target 'build-python'`.
> - Use `sudo python3 -m pip …` (not `sudo pip …`); the bare `pip` wrapper often
>   isn't on root's PATH → `pip: command not found`.
> - `--break-system-packages` is required on Raspberry Pi OS Bookworm (PEP 668).
> - If the build fails on **Cython**, add `--no-build-isolation` so it uses the
>   system `cython3` you just installed.

Verify it installed — **from your home directory, not from `bindings/python`**
(that folder holds an uncompiled `rgbmatrix/` source dir that shadows the real
package and would raise `No module named 'rgbmatrix.core'`):

```bash
cd ~
python3 -c "import rgbmatrix; print('rgbmatrix OK')"
```

Quick hardware test (Ctrl-C to stop):

```bash
sudo ~/rpi-rgb-led-matrix/examples-api-use/demo -D0 \
  --led-rows=64 --led-cols=64 --led-gpio-mapping=adafruit-hat
```
If you see moving squares, the wiring is good.

## 4. Disable on-board sound (prevents glitching)

```bash
echo "blacklist snd_bcm2835" | sudo tee /etc/modprobe.d/blacklist-rgb-matrix.conf
sudo update-initramfs -u
```

## 5. Get this project onto the Pi

Copy it over (from your PC):

```bash
# from the project root on your PC
scp -r . <user>@raspberrypi.local:~/pixel-pusher
```
…or `git clone` it if you've pushed it to a repo.

> **Gotcha:** if you `scp -r .`, you also copy the Windows `node_modules` and
> `.venv`. Those are platform-specific and won't run on the Pi (e.g. you'll get
> `sh: 1: vite: Permission denied` when building the frontend). Delete them on
> the Pi before continuing, so they get rebuilt natively:
> ```bash
> rm -rf ~/pixel-pusher/frontend/node_modules ~/pixel-pusher/backend/.venv
> ```
> Better: copy with rsync excluding them —
> `rsync -av --exclude node_modules --exclude .venv --exclude data ./ <user>@raspberrypi.local:~/pixel-pusher/`

## 6. Python environment

```bash
cd ~/pixel-pusher/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# Note: the 'rgbmatrix' module from step 3 is installed system-wide; allow the
# venv to see it, OR create the venv with --system-site-packages:
#   python3 -m venv --system-site-packages .venv
```

> **Important:** the venv must be able to import `rgbmatrix`. The simplest path is
> to recreate the venv with `--system-site-packages` so it picks up the
> system-installed binding from step 3. The included `install-pi.sh` does this.

Create your config:

```bash
cp .env.example .env
nano .env   # set MATRIX_BACKEND=hardware, MATRIX_GPIO_SLOWDOWN=1 or 2, music creds
```

## 7. Build the frontend

The backend just needs `frontend/dist` to exist. Two ways to get it:

**Option A — build on your PC and copy only `dist/` (recommended; avoids Node on
the slow Pi):**

```bash
# on your PC
cd frontend && npm run build
scp -r dist <user>@raspberrypi.local:~/pixel-pusher/frontend/
```

**Option B — build on the Pi (Node 18+):**

```bash
# on the Pi
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
cd ~/pixel-pusher/frontend
rm -rf node_modules       # in case a Windows node_modules was copied over
npm install               # installs the correct Linux binaries
npm run build             # produces frontend/dist, which the backend serves
```

> `sh: 1: vite: Permission denied` means a Windows `node_modules` was copied to
> the Pi. `rm -rf node_modules && npm install` fixes it.

## 8. First run (manual)

The matrix library needs root for GPIO timing:

```bash
cd ~/pixel-pusher/backend
sudo .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --loop asyncio
```

Open **http://raspberrypi.local:8000** from any machine on your network.

> `--loop asyncio` avoids a harmless-but-noisy `RuntimeError: Event loop stopped
> before Future completed` that `uvloop` throws on Ctrl-C under Python 3.13. It
> only affects shutdown, not operation.

## 9. Auto-start on boot (systemd)

Install the service so it runs headless and restarts on crash/boot:

```bash
sudo cp ~/pixel-pusher/deploy/pixel-pusher.service /etc/systemd/system/
# edit paths/user in the unit if your username/dir differ
sudo nano /etc/systemd/system/pixel-pusher.service
sudo systemctl daemon-reload
sudo systemctl enable --now pixel-pusher
sudo systemctl status pixel-pusher      # check it's running
journalctl -u pixel-pusher -f           # live logs
```

## Tuning notes

- **`MATRIX_GPIO_SLOWDOWN`** depends on the Pi: Pi 3 usually wants **1–2**, Pi 4
  wants **3–4**. Raise it if the image flickers or shows side-lines.
- **`MATRIX_PANEL_TYPE=FM6126A`** — many 64×64 panels use FM6126A chips and show
  garbled/red/half-lit output until you set this. If your panel looks wrong, try it.
- If you did the GPIO4↔GPIO18 solder mod, set
  `MATRIX_HARDWARE_MAPPING=adafruit-hat-pwm` for less flicker.
- Lower `MATRIX_BRIGHTNESS` if the panel draws more current than your PSU likes.
- **`isolcpus=3`** in `/boot/cmdline.txt` (then reboot) dedicates a core to the
  display for smoother output — worth it on any Pi, more so at higher panel counts.

A solid **white turning reddish** with uneven brightness means the panel isn't
getting enough clean current — that's a power/wiring issue, not software. See
[HARDWARE.md](HARDWARE.md).

## Music setup quick-reference

- **Last.fm (covers YouTube Music):** create an API key at
  <https://www.last.fm/api/account/create>, set `LASTFM_API_KEY` + `LASTFM_USER`.
  Make sure your players scrobble (YouTube Music: use a scrobbler browser
  extension; VLC: the "audioscrobbler" plugin; phones: Last.fm app / Pano Scrobbler).
- **Plex:** set `PLEX_BASE_URL` (e.g. `http://192.168.1.50:32400`) and `PLEX_TOKEN`.
- **VLC:** enable VLC's Web interface and set `VLC_BASE_URL` + `VLC_PASSWORD`.

Then pick the source and hit **Start syncing** in the web UI.
