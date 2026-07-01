#!/usr/bin/env bash
# Pull the latest code and apply it on the Pi: update deps, rebuild the frontend,
# and restart the service. Run on the Pi:  bash deploy/update.sh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "==> git pull"
git pull --ff-only

echo "==> backend deps (fast if unchanged)"
backend/.venv/bin/pip install -q -r backend/requirements.txt

if command -v npm >/dev/null 2>&1; then
  echo "==> build frontend"
  cd frontend
  [ -d node_modules ] || npm install
  npm run build
  cd ..
else
  echo "   npm not found — skipping frontend build."
  echo "   (Build on your PC and scp frontend/dist to the Pi, or install Node.)"
fi

echo "==> restart service"
sudo systemctl restart pixel-pusher

echo "Done. Watch logs with:  journalctl -u pixel-pusher -f"
