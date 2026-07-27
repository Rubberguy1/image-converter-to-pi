# Sign the Firefox extension via Mozilla (unlisted) so it installs PERMANENTLY
# on regular Firefox. Temporary add-ons vanish on restart because they're
# unsigned.
#
# One-time setup:
#   1. Create a free Firefox add-on account and API credentials:
#        https://addons.mozilla.org/en-US/developers/addon/api/key/
#   2. npm install --global web-ext
#   3. Set your credentials in this shell:
#        $env:WEB_EXT_API_KEY    = "user:XXXXXXX:123"
#        $env:WEB_EXT_API_SECRET = "your-long-secret"
#
# Then:  ./build.ps1 ; ./sign-firefox.ps1
# The signed .xpi lands in build/firefox-signed/. Open it in Firefox to install.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not $env:WEB_EXT_API_KEY -or -not $env:WEB_EXT_API_SECRET) {
  Write-Error "Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET first (see the top of this script)."
}

& web-ext sign `
  --source-dir "$root/build/firefox" `
  --artifacts-dir "$root/build/firefox-signed" `
  --channel unlisted

Write-Host "Signed .xpi is in build/firefox-signed/. Open it in Firefox to install permanently."
