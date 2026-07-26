#!/usr/bin/env bash
# Assembles loadable extension folders for each browser under build/.
# A browser needs its manifest named exactly "manifest.json", so we copy the
# shared files plus the right manifest into build/chromium and build/firefox.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

SHARED="inject.js content.js background.js options.html options.js popup.html popup.js"

build() {
  local name="$1" manifest="$2"
  local out="build/$name"
  rm -rf "$out"
  mkdir -p "$out"
  for f in $SHARED; do cp "$f" "$out/$f"; done
  cp "$manifest" "$out/manifest.json"
  echo "Built $out"
}

build chromium manifest.chromium.json
build firefox  manifest.firefox.json
echo "Done. Load build/chromium or build/firefox as an unpacked extension."
