#!/usr/bin/env bash
# Turn on HTTPS for the Pixel Pusher backend.
#
#   sudo bash deploy/enable-https.sh                 # generate a self-signed cert
#   sudo bash deploy/enable-https.sh cert.pem key.pem  # use an existing cert+key
#                                                      # (e.g. from mkcert)
#
# It writes TLS_CERTFILE/TLS_KEYFILE into backend/.env, refreshes the systemd
# unit so it serves TLS, and restarts. See docs/HTTPS.md for how to make the
# cert trusted by your browser (required for the Firefox extension).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
ENV_FILE="$BACKEND_DIR/.env"
CERT_DIR="$BACKEND_DIR/certs"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash deploy/enable-https.sh" >&2
  exit 1
fi

mkdir -p "$CERT_DIR"

if [ "$#" -ge 2 ]; then
  CERT="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  KEY="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
  echo "==> Using provided cert:"
  echo "      cert: $CERT"
  echo "      key : $KEY"
  [ -f "$CERT" ] && [ -f "$KEY" ] || { echo "cert or key not found" >&2; exit 1; }
else
  CERT="$CERT_DIR/pixel-pusher.crt"
  KEY="$CERT_DIR/pixel-pusher.key"
  IP="$(hostname -I | awk '{print $1}')"
  SAN="DNS:$(hostname),DNS:$(hostname).local,DNS:localhost,IP:127.0.0.1"
  [ -n "$IP" ] && SAN="$SAN,IP:$IP"
  echo "==> Generating self-signed cert for: $SAN"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$KEY" -out "$CERT" -days 3650 \
    -subj "/CN=$(hostname)" \
    -addext "subjectAltName=$SAN" >/dev/null 2>&1
  chmod 600 "$KEY"
  echo "      cert: $CERT"
  echo "      key : $KEY"
fi

# --- write paths into .env (bare KEY=VALUE; pydantic chokes on inline comments) ---
touch "$ENV_FILE"
set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${val}#" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}
set_env TLS_CERTFILE "$CERT"
set_env TLS_KEYFILE "$KEY"
echo "==> Wrote TLS_CERTFILE / TLS_KEYFILE to $ENV_FILE"

# --- refresh the systemd unit (so ExecStart uses `python -m app`) + restart ---
SERVICE=/etc/systemd/system/pixel-pusher.service
if [ -f "$SERVICE" ]; then
  cp "$PROJECT_DIR/deploy/pixel-pusher.service" "$SERVICE"
  sed -i "s#/home/pi/pixel-pusher#$PROJECT_DIR#g" "$SERVICE"
  systemctl daemon-reload
  systemctl restart pixel-pusher
  echo "==> Restarted pixel-pusher over HTTPS."
else
  echo "!! $SERVICE not found — restart the backend yourself."
fi

IPADDR="$(hostname -I | awk '{print $1}')"
cat <<EOF

Done. The panel now serves HTTPS on port 8000:
    https://${IPADDR:-<pi-ip>}:8000

Next:
  1. Trust the certificate in your browser (see docs/HTTPS.md).
  2. Point the extension + web app at the https:// URL (not http://).
  3. Check it started cleanly:  journalctl -u pixel-pusher -n 20 --no-pager

To go back to plain HTTP: remove the TLS_CERTFILE/TLS_KEYFILE lines from
$ENV_FILE and restart (sudo systemctl restart pixel-pusher).
EOF
