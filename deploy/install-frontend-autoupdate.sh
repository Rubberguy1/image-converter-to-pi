#!/usr/bin/env bash
# Optional: auto-update the Docker frontend on this host (NAS/server) by running
# the deployment-aware update.sh on a schedule. Installs a cron entry for the
# current user. Requires this user to have Docker access.
#
#   bash deploy/install-frontend-autoupdate.sh            # every 30 min (default)
#   bash deploy/install-frontend-autoupdate.sh 15         # every 15 min
#
# Remove it later with:  crontab -e   (delete the pixel-pusher line)
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MINUTES="${1:-30}"
LOG="$PROJECT_DIR/update.log"
LINE="*/$MINUTES * * * * cd $PROJECT_DIR && bash deploy/update.sh >> $LOG 2>&1 # pixel-pusher"

if ! command -v crontab >/dev/null 2>&1; then
  echo "cron not available; install it or run 'bash deploy/update.sh' manually." >&2
  exit 1
fi

# Replace any existing pixel-pusher line, keep everything else.
( crontab -l 2>/dev/null | grep -v '# pixel-pusher' ; echo "$LINE" ) | crontab -

echo "Installed: runs deploy/update.sh every $MINUTES min (logs to $LOG)."
echo "Check with: crontab -l"
