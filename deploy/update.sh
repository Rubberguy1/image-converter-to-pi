#!/usr/bin/env bash
# Smart updater: pull the latest code, then do ONLY the work the changes require.
#   - backend deps reinstalled only if requirements.txt changed
#   - frontend rebuilt only if the frontend changed AND it's served here (dist exists)
#   - service restarted only if backend code (or deps) changed
# Run on the Pi:  bash deploy/update.sh   (also invoked by the web UI's "Update now")
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

BEFORE="$(git rev-parse HEAD)"
echo "==> git pull"
git pull --ff-only
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "Already up to date — nothing to do."
  exit 0
fi

CHANGED="$(git diff --name-only "$BEFORE" "$AFTER")"
echo "==> changed files:"
echo "$CHANGED" | sed 's/^/     /'

match() { echo "$CHANGED" | grep -qE "$1"; }

need_deps=0;    match '^backend/requirements\.txt$' && need_deps=1
need_backend=0; match '^backend/app/' && need_backend=1
need_frontend=0; match '^frontend/(src/|public/|package.*\.json|vite\.config|index\.html|Dockerfile|docker/)' && need_frontend=1

if [ "$need_deps" -eq 1 ]; then
  echo "==> requirements changed — installing backend deps"
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi

if [ -f .backend-only ]; then
  # Explicit backend-only install: never build the UI, and drop any stale dist
  # so the backend serves API-only regardless of what a previous run left behind.
  echo "==> backend-only (.backend-only present) — skipping frontend build."
  [ -d frontend/dist ] && { rm -rf frontend/dist; echo "   removed stale frontend/dist."; }
elif [ "$need_frontend" -eq 1 ]; then
  if [ ! -d frontend/dist ]; then
    echo "==> frontend changed, but no dist here — skipping build."
  elif command -v npm >/dev/null 2>&1; then
    echo "==> frontend changed — rebuilding"
    ( cd frontend && { [ -d node_modules ] || npm install; } && npm run build )
  else
    echo "==> frontend changed but npm not found — skipping build."
    echo "   (Build frontend/dist on your PC and copy it over, or install Node.)"
  fi
else
  echo "==> no frontend changes — skipping build."
fi

if [ "$need_backend" -eq 1 ] || [ "$need_deps" -eq 1 ]; then
  echo "==> backend changed — restarting service"
  sudo systemctl restart pixel-pusher
else
  echo "==> no backend changes — leaving the service running (new UI is served live)."
fi

echo "Done ($BEFORE -> $AFTER). Logs:  journalctl -u pixel-pusher -f"
