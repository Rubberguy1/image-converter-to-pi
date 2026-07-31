#!/usr/bin/env bash
# Smart, deployment-aware updater. Run the SAME command on any host — it detects
# what runs here and does only the right work:
#   - Backend host (Pi): reinstall deps if changed, rebuild the on-Pi UI (unless
#     backend-only), restart the service if the backend/deps changed.
#   - Docker frontend host (NAS / server): rebuild + restart the container.
# A host can be both. Also invoked by the web UI's "Update now" (runs on the Pi).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# -c safe.directory so git works when this runs as root (self-update) but the
# repo is owned by the login user ("dubious ownership").
GIT="git -c safe.directory=$PROJECT_DIR"

BEFORE="$($GIT rev-parse HEAD)"
echo "==> git pull"
$GIT pull --ff-only
AFTER="$($GIT rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "Already up to date — reconciling deps only (in case anything's missing)."
  CHANGED=""
else
  CHANGED="$($GIT diff --name-only "$BEFORE" "$AFTER")"
  echo "==> changed files:"
  echo "$CHANGED" | sed 's/^/     /'
fi

match() { echo "$CHANGED" | grep -qE "$1"; }

need_deps=0;     match '^backend/requirements\.txt$' && need_deps=1
need_backend=0;  match '^backend/app/' && need_backend=1
need_frontend=0; match '^frontend/(src/|public/|package.*\.json|vite\.config|index\.html|Dockerfile|docker/)' && need_frontend=1
need_compose=0;  match '^docker-compose\.yml$' && need_compose=1

# --- detect this host's role(s) ---
has_backend=0
[ -d backend/.venv ] && has_backend=1
docker_frontend=0
if command -v docker >/dev/null 2>&1 && docker compose ps 2>/dev/null | grep -qi 'frontend'; then
  docker_frontend=1
fi

# ---------------------------------------------------------------- backend host
if [ "$has_backend" -eq 1 ]; then
  # Reconcile deps against requirements.txt on every update. This is idempotent
  # (pip no-ops what's already satisfied) and self-heals the case where an
  # earlier update crossed a commit that added a package without installing it
  # — e.g. python-a2s. Restart only if pip actually installed something.
  if [ "$need_deps" -eq 1 ]; then
    echo "==> requirements changed — installing backend deps"
  else
    echo "==> reconciling backend deps (catches anything missing)"
  fi
  pip_out="$(backend/.venv/bin/pip install -r backend/requirements.txt 2>&1)" \
    || { echo "$pip_out"; echo "!! pip install failed"; exit 1; }
  if echo "$pip_out" | grep -qiE 'Successfully installed|Installing collected packages'; then
    echo "   installed/updated packages — service will restart."
    need_backend=1
  fi

  if [ -f .backend-only ]; then
    echo "==> backend-only (.backend-only present) — skipping on-Pi frontend build."
    [ -d frontend/dist ] && { rm -rf frontend/dist; echo "   removed stale frontend/dist."; }
  elif [ "$need_frontend" -eq 1 ]; then
    if [ ! -d frontend/dist ]; then
      echo "==> frontend changed, but no dist here — skipping build."
    elif command -v npm >/dev/null 2>&1; then
      echo "==> frontend changed — rebuilding on-Pi UI"
      ( cd frontend && { [ -d node_modules ] || npm install; } && npm run build )
    else
      echo "==> frontend changed but npm not found — skipping build."
      echo "   (Build frontend/dist on your PC and copy it over, or install Node.)"
    fi
  else
    echo "==> no frontend changes — skipping on-Pi build."
  fi

  if [ "$need_backend" -eq 1 ] || [ "$need_deps" -eq 1 ]; then
    echo "==> backend changed — restarting service"
    sudo systemctl restart pixel-pusher
  else
    echo "==> no backend changes — leaving the service running (new UI served live)."
  fi
fi

# --------------------------------------------------------- docker frontend host
if [ "$docker_frontend" -eq 1 ]; then
  if [ "$need_frontend" -eq 1 ] || [ "$need_compose" -eq 1 ]; then
    echo "==> docker frontend — rebuilding + restarting container"
    docker compose up -d --build
    docker image prune -f >/dev/null 2>&1 || true
  else
    echo "==> no frontend/compose changes — docker container left as is."
  fi
fi

if [ "$has_backend" -eq 0 ] && [ "$docker_frontend" -eq 0 ]; then
  echo "==> Nothing to update here (no backend venv, no running docker frontend)."
  echo "   On the NAS, start it once with:  docker compose up -d --build"
fi

echo "Done ($BEFORE -> $AFTER)."
