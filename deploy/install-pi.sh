#!/usr/bin/env bash
# Pixel Pusher — Raspberry Pi installer.
# Run on the Pi from the project root:  bash deploy/install-pi.sh
# Idempotent-ish: safe to re-run. See docs/PI_SETUP.md for the manual steps.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
RGB_DIR="$HOME/rpi-rgb-led-matrix"

echo "==> System packages"
sudo apt update
sudo apt install -y git python3-venv python3-dev python3-pip python3-pillow \
    build-essential libgraphicsmagick++-dev libwebp-dev cython3

echo "==> Build rpi-rgb-led-matrix (if missing)"
if ! python3 -c "import rgbmatrix" 2>/dev/null; then
  if [ ! -d "$RGB_DIR" ]; then
    git clone https://github.com/hzeller/rpi-rgb-led-matrix.git "$RGB_DIR"
  fi
  # Install with pip from the REPO ROOT (pyproject.toml is at the root, not in
  # bindings/python). This builds the C++ lib + Cython bindings. If the build
  # ever fails on Cython, add --no-build-isolation to use the system cython3.
  sudo python3 -m pip install "$RGB_DIR" --break-system-packages
else
  echo "    rgbmatrix already importable, skipping build."
fi

echo "==> Disable on-board sound (prevents matrix glitching)"
echo "blacklist snd_bcm2835" | sudo tee /etc/modprobe.d/blacklist-rgb-matrix.conf >/dev/null

echo "==> Python venv (with system site packages so it sees rgbmatrix)"
if [ ! -d "$BACKEND_DIR/.venv" ]; then
  python3 -m venv --system-site-packages "$BACKEND_DIR/.venv"
fi
"$BACKEND_DIR/.venv/bin/pip" install --upgrade pip
"$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"

echo "==> .env"
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  sed -i 's/^MATRIX_BACKEND=.*/MATRIX_BACKEND=hardware/' "$BACKEND_DIR/.env"
  echo "    created backend/.env (review it: nano backend/.env)"
fi

echo "==> Build frontend (if Node present)"
if command -v npm >/dev/null 2>&1; then
  (cd "$FRONTEND_DIR" && npm install && npm run build)
else
  echo "    npm not found — build the frontend elsewhere and copy frontend/dist here,"
  echo "    or install Node 20 and re-run. (See docs/PI_SETUP.md step 7.)"
fi

echo "==> systemd service"
SERVICE=/etc/systemd/system/pixel-pusher.service
sudo cp "$PROJECT_DIR/deploy/pixel-pusher.service" "$SERVICE"
# Point the unit at the actual project location and user.
sudo sed -i "s#/home/pi/pixel-pusher#$PROJECT_DIR#g" "$SERVICE"
sudo systemctl daemon-reload
sudo systemctl enable --now pixel-pusher

echo
echo "Done. Open http://$(hostname).local:8000 from another machine."
echo "Logs:   journalctl -u pixel-pusher -f"
